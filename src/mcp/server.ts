#!/usr/bin/env node

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';
import { z } from 'zod';
import { embedPromptMetadataInWebp } from '../image/webpMetadata';
import { assertInputImageSize, inferMimeTypeFromPathname } from '../image/inputRules';
import { encodeWebp, initWasm } from '../image/wasm';
import {
  API_KEY_NAMES,
  getProvider,
  PROVIDER_API_KEY_MAP,
  PROVIDER_IDS,
  type ApiKeyName,
  type ProviderId,
} from '../providers';
import type { InputImageData, RawImageData } from '../providers/types';
import { fetchWithRetry } from '../utils/network';
import {
  API_KEY_ENV_NAMES,
  credentialsFilePath,
  readCredentialsFile,
  resolveApiKey,
} from './credentials';
import { formatImageResult } from './resultFormat';
import { readWorkspaceImageGenSettings } from './workspaceSettings';

const SERVER_VERSION = '1.4.0';
const ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'] as const;
const MAX_DECODED_PIXEL_COUNT = 20_000_000;
const SETUP_COMMAND_HINT = 'the VS Code command "ImageGen: Connect External Agents (MCP)"';

/**
 * Only hints that differ from the spec defaults are sent, because every byte
 * here sits in the agent's context for the whole session. Both image tools are
 * writing (`readOnlyHint` false), non-repeatable (`idempotentHint` false) and
 * call a third-party API (`openWorldHint` true) — all defaults. They only add
 * files, so `destructiveHint` has to be corrected from its default of true.
 */
const IMAGE_TOOL_ANNOTATIONS = { destructiveHint: false } as const;

type SaveMode = 'persistent' | 'temporary';

interface McpConfig {
  provider: ProviderId;
  outputDirectory: string;
  webpQuality: number;
  requestTimeoutMs: number;
  maxInputImageMB: number;
  embedPromptMetadata: boolean;
  workspaceRoot: string;
}

interface GenerateRequest {
  prompt: string;
  aspectRatio?: string;
  provider?: string;
  saveMode?: SaveMode;
}

interface EditRequest extends GenerateRequest {
  inputImage: string;
}

const server = new McpServer({ name: 'imagegen', version: SERVER_VERSION });

// Tool definitions sit in the agent's context for the whole session, so they
// stay terse: the aspect-ratio enum earns its place by preventing failed API
// calls, while the model list would not — `check_setup` reports it on demand.
const sharedImageInputs = {
  aspectRatio: z.enum(ASPECT_RATIOS).optional().describe('Defaults to 16:9.'),
  provider: z.string().optional().describe('Model id override; check_setup lists the valid ids.'),
  saveMode: z.enum(['persistent', 'temporary']).optional()
    .describe('temporary writes to the OS temp directory for throwaway images. Defaults to persistent.'),
};

server.registerTool(
  'generate_image',
  {
    title: 'Generate image',
    description: 'Generate an image from a text prompt and save it as an optimized WebP in the workspace. '
      + 'Returns the saved path and a Markdown link to paste into documents.',
    inputSchema: {
      prompt: z.string().min(1).describe('What the image shows, including subject, style and composition.'),
      ...sharedImageInputs,
    },
    annotations: IMAGE_TOOL_ANNOTATIONS,
  },
  async (request) => textResult(await generateImage(request)),
);

server.registerTool(
  'edit_image',
  {
    title: 'Edit image',
    description: 'Edit an existing image and save the result as an optimized WebP in the workspace. '
      + 'Returns the saved path and a Markdown link to paste into documents.',
    inputSchema: {
      prompt: z.string().min(1).describe('How the source image should change.'),
      inputImage: z.string().min(1).describe('Workspace path, absolute path, URL, data URL, or Markdown image snippet.'),
      ...sharedImageInputs,
    },
    annotations: IMAGE_TOOL_ANNOTATIONS,
  },
  async (request) => textResult(await editImage(request)),
);

server.registerTool(
  'check_setup',
  {
    title: 'Check ImageGen setup',
    description: 'Report the active configuration, which provider keys are available, and the valid model ids. '
      + 'Call this when a generate or edit call fails.',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  async () => textResult(checkSetup()),
);

async function generateImage(request: GenerateRequest): Promise<string> {
  const config = readConfig();
  const providerId = resolveProviderId(request.provider, config.provider);
  const startedAt = Date.now();
  const rawImage = await requestProviderImage(providerId, config, request);
  return saveImage(rawImage, providerId, config, request, Date.now() - startedAt, 'imagegen');
}

async function editImage(request: EditRequest): Promise<string> {
  const config = readConfig();
  const providerId = resolveProviderId(request.provider, config.provider);
  const inputImage = await resolveInputImage(request.inputImage, config);
  const startedAt = Date.now();
  const rawImage = await requestProviderImage(providerId, config, request, inputImage);
  return saveImage(rawImage, providerId, config, request, Date.now() - startedAt, 'imageedit');
}

function checkSetup(): string {
  const config = readConfig();
  const fileCredentials = readCredentialsFile();
  const activeKeyName = PROVIDER_API_KEY_MAP[config.provider];
  const ready = Boolean(resolveApiKey(activeKeyName, fileCredentials));

  const keyReport = API_KEY_NAMES.map((keyName) => {
    const fromEnvironment = process.env[API_KEY_ENV_NAMES[keyName]]?.trim();
    const label = keyName.replace('-api-key', '');
    if (fromEnvironment) {
      return `${label} yes (environment)`;
    }
    return fileCredentials[keyName] ? `${label} yes (credentials file)` : `${label} no`;
  }).join(', ');

  const lines = [
    `ImageGen MCP ${SERVER_VERSION} on node ${process.version} — ${ready ? 'ready' : 'not ready'}`,
    `model: ${config.provider}`,
    `workspace: ${config.workspaceRoot}`,
    `output: ${config.outputDirectory} (WebP quality ${config.webpQuality}, prompt metadata ${config.embedPromptMetadata ? 'on' : 'off'})`,
    `keys: ${keyReport}`,
    `credentials file: ${credentialsFilePath()}${fs.existsSync(credentialsFilePath()) ? '' : ' (missing)'}`,
    `valid model ids: ${PROVIDER_IDS.join(', ')}`,
  ];
  if (!ready) {
    lines.push(
      `fix: run ${SETUP_COMMAND_HINT} to export the key stored in VS Code, `
        + `or set ${API_KEY_ENV_NAMES[activeKeyName]} in the MCP server environment.`,
    );
  }
  return lines.join('\n');
}

async function requestProviderImage(
  providerId: ProviderId,
  config: McpConfig,
  request: GenerateRequest,
  inputImage?: InputImageData,
): Promise<RawImageData> {
  const provider = getProvider(providerId);
  const apiKey = getApiKey(providerId);
  const options = {
    prompt: request.prompt,
    aspectRatio: request.aspectRatio ?? '16:9',
    quality: config.webpQuality,
    requestTimeoutMs: config.requestTimeoutMs,
  };

  if (!inputImage) {
    return provider.generate(apiKey, options);
  }
  if (!provider.edit) {
    const editable = PROVIDER_IDS.filter((id) => getProvider(id).edit);
    throw new Error(`Model "${providerId}" cannot edit images. Pass provider with one of: ${editable.join(', ')}.`);
  }
  return provider.edit(apiKey, { ...options, inputImage });
}

async function saveImage(
  rawImage: RawImageData,
  providerId: ProviderId,
  config: McpConfig,
  request: GenerateRequest,
  apiCallDurationMs: number,
  filePrefix: 'imagegen' | 'imageedit',
): Promise<string> {
  await ensureEncoderReady();
  const decoded = decodeRawImage(rawImage);
  const webpBuffer = await encodeWebp({
    data: new Uint8ClampedArray(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
    width: decoded.width,
    height: decoded.height,
    colorSpace: 'srgb',
  } as unknown as Parameters<typeof encodeWebp>[0], { quality: config.webpQuality });

  const outputDirectory = request.saveMode === 'temporary'
    ? path.join(os.tmpdir(), 'ImageGen')
    : path.resolve(config.workspaceRoot, config.outputDirectory);
  await fs.promises.mkdir(outputDirectory, { recursive: true });

  const filename = `${filePrefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.webp`;
  const absolutePath = path.join(outputDirectory, filename);
  const savedBuffer = config.embedPromptMetadata
    ? embedPromptMetadataInWebp(new Uint8Array(webpBuffer), {
        prompt: request.prompt,
        filePrefix,
        providerId,
        aspectRatio: request.aspectRatio ?? '16:9',
        width: decoded.width,
        height: decoded.height,
        hasAlpha: hasTransparency(decoded.data),
        generatedAt: new Date().toISOString(),
      })
    : new Uint8Array(webpBuffer);
  await fs.promises.writeFile(absolutePath, savedBuffer);

  const outputPath = request.saveMode === 'temporary'
    ? absolutePath
    : path.relative(config.workspaceRoot, absolutePath).replace(/\\/g, '/');

  return formatImageResult({
    outputPath,
    prompt: request.prompt,
    providerId,
    width: decoded.width,
    height: decoded.height,
    savedBytes: savedBuffer.byteLength,
    originalBytes: rawImage.rawBuffer.byteLength,
    apiCallDurationMs,
  });
}

function decodeRawImage(rawImage: RawImageData): { data: Uint8Array; width: number; height: number } {
  const mimeType = rawImage.mimeType.toLowerCase();
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    const decoded = jpeg.decode(rawImage.rawBuffer, { useTArray: true, formatAsRGBA: true });
    validateDimensions(decoded.width, decoded.height);
    return { data: decoded.data, width: decoded.width, height: decoded.height };
  }
  if (mimeType.includes('png')) {
    const decoded = PNG.sync.read(rawImage.rawBuffer);
    validateDimensions(decoded.width, decoded.height);
    return {
      data: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
      width: decoded.width,
      height: decoded.height,
    };
  }
  throw new Error(`ImageGen: Unsupported image type returned by provider: ${rawImage.mimeType}`);
}

async function resolveInputImage(source: string, config: McpConfig): Promise<InputImageData> {
  const value = source.trim().replace(/^!\[[^\]]*\]\(([^)]+)\)$/, '$1');
  const maxBytes = Math.round(config.maxInputImageMB * 1024 * 1024);
  const dataUrl = value.match(/^data:([^;]+);base64,([\s\S]+)$/i);
  if (dataUrl) {
    const rawBuffer = Buffer.from(dataUrl[2], 'base64');
    assertInputImageSize(rawBuffer.byteLength, maxBytes);
    return { mimeType: dataUrl[1].toLowerCase(), rawBuffer };
  }
  if (/^https?:\/\//i.test(value)) {
    const response = await fetchWithRetry(value, {}, { requestTimeoutMs: config.requestTimeoutMs });
    if (!response.ok) {
      throw new Error(`ImageGen: Failed to download input image (${response.status}).`);
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength)) {
      assertInputImageSize(contentLength, maxBytes);
    }
    const rawBuffer = Buffer.from(await response.arrayBuffer());
    assertInputImageSize(rawBuffer.byteLength, maxBytes);
    const mimeType = response.headers.get('content-type')?.split(';')[0]?.toLowerCase();
    return { mimeType: mimeType?.startsWith('image/') ? mimeType : inferMimeTypeFromPathname(value), rawBuffer };
  }

  const localPath = path.isAbsolute(value) ? value : path.resolve(config.workspaceRoot, value);
  const stats = await fs.promises.stat(localPath).catch(() => undefined);
  if (!stats || !stats.isFile()) {
    throw new Error(
      `ImageGen: Input image not found at "${value}". Paths are resolved against ${config.workspaceRoot}.`,
    );
  }
  assertInputImageSize(stats.size, maxBytes);
  return { mimeType: inferMimeTypeFromPathname(localPath), rawBuffer: await fs.promises.readFile(localPath) };
}

function resolveProviderId(requested: string | undefined, configured: ProviderId): ProviderId {
  if (requested === undefined) {
    return configured;
  }
  const value = requested.trim();
  if ((PROVIDER_IDS as readonly string[]).includes(value)) {
    return value as ProviderId;
  }
  throw new Error(`ImageGen: Unknown model id "${value}". Valid ids: ${PROVIDER_IDS.join(', ')}.`);
}

function getApiKey(providerId: ProviderId): string {
  const keyName: ApiKeyName = PROVIDER_API_KEY_MAP[providerId];
  const apiKey = resolveApiKey(keyName, readCredentialsFile());
  if (!apiKey) {
    throw new Error(
      `ImageGen: No API key available for model "${providerId}". `
        + `Set ${API_KEY_ENV_NAMES[keyName]} in the MCP server environment, or run ${SETUP_COMMAND_HINT} `
        + `to export the key stored in VS Code to ${credentialsFilePath()}.`,
    );
  }
  return apiKey;
}

function readConfig(): McpConfig {
  const workspaceRoot = path.resolve(process.env.IMAGEGEN_WORKSPACE_DIR ?? process.cwd());
  const settings = readWorkspaceImageGenSettings(workspaceRoot);

  const provider = process.env.IMAGEGEN_PROVIDER
    ?? readSettingString(settings, 'provider')
    ?? 'gemini-3.1-flash-image-preview';
  if (!(PROVIDER_IDS as readonly string[]).includes(provider)) {
    throw new Error(`ImageGen: Unknown model id "${provider}" in configuration. Valid ids: ${PROVIDER_IDS.join(', ')}.`);
  }

  return {
    provider: provider as ProviderId,
    outputDirectory: process.env.IMAGEGEN_OUTPUT_DIRECTORY
      ?? readSettingString(settings, 'outputDirectory')
      ?? 'assets/images',
    webpQuality: readNumber('IMAGEGEN_WEBP_QUALITY', settings, 'webpQuality', 80, 0, 100),
    requestTimeoutMs: readNumber('IMAGEGEN_REQUEST_TIMEOUT_MS', settings, 'requestTimeoutMs', 45000, 5000, 180000),
    maxInputImageMB: readNumber('IMAGEGEN_MAX_INPUT_IMAGE_MB', settings, 'maxInputImageMB', 12, 1, 100),
    embedPromptMetadata: process.env.IMAGEGEN_EMBED_PROMPT_METADATA !== undefined
      ? process.env.IMAGEGEN_EMBED_PROMPT_METADATA !== 'false'
      : readSettingBoolean(settings, 'embedPromptMetadata') ?? true,
    workspaceRoot,
  };
}

function readSettingString(settings: Record<string, unknown>, key: string): string | undefined {
  const value = settings[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readSettingBoolean(settings: Record<string, unknown>, key: string): boolean | undefined {
  const value = settings[key];
  return typeof value === 'boolean' ? value : undefined;
}

/** Environment variable wins, then the workspace setting, then the built-in default. */
function readNumber(
  environmentName: string,
  settings: Record<string, unknown>,
  settingKey: string,
  defaultValue: number,
  min: number,
  max: number,
): number {
  const fromEnvironment = process.env[environmentName];
  if (fromEnvironment !== undefined) {
    const parsed = Number(fromEnvironment);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      throw new Error(`ImageGen: ${environmentName} must be a number between ${min} and ${max}.`);
    }
    return parsed;
  }

  const fromSettings = settings[settingKey];
  if (typeof fromSettings === 'number' && Number.isFinite(fromSettings) && fromSettings >= min && fromSettings <= max) {
    return fromSettings;
  }
  return defaultValue;
}

function validateDimensions(width: number, height: number): void {
  if (width <= 0 || height <= 0 || width * height > MAX_DECODED_PIXEL_COUNT) {
    throw new Error('ImageGen: Image resolution is invalid or too large to process safely.');
  }
}

function hasTransparency(data: Uint8Array): boolean {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] !== 255) {
      return true;
    }
  }
  return false;
}

function textResult(text: string): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text }] };
}

/**
 * The WASM encoder lives in `node_modules/@jsquash`, which sits next to the
 * bundle both in this repository and inside an installed extension directory.
 * Trying several roots keeps the server working when an agent starts it from
 * an unrelated working directory.
 */
function resolveWasmRoot(): string {
  const candidates = [
    process.env.IMAGEGEN_EXTENSION_DIR,
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '..'),
    process.cwd(),
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'node_modules', '@jsquash', 'webp'))) {
      return candidate;
    }
  }
  throw new Error(
    `ImageGen: Could not locate node_modules/@jsquash/webp. Looked in: ${candidates.join(', ')}. `
      + 'Set IMAGEGEN_EXTENSION_DIR to the ImageGen installation directory.',
  );
}

/**
 * The encoder is compiled once, on first use. Moving it off the startup path
 * buys little time (measured at ~3 ms), but most agent sessions never generate
 * an image, and those now skip reading and compiling the ~900 KB module.
 */
let encoderReady: Promise<void> | undefined;

function ensureEncoderReady(): Promise<void> {
  if (!encoderReady) {
    encoderReady = initWasm(resolveWasmRoot()).catch((error: unknown) => {
      encoderReady = undefined;
      throw error;
    });
  }
  return encoderReady;
}

async function start(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
