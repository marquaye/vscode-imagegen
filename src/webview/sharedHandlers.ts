import * as fs from 'fs';
import * as vscode from 'vscode';
import { getLastActiveEditor } from '../editorTracker';
import { editAndSaveImage, generateAndSaveImage } from '../imageService';
import { API_KEY_NAMES, PROVIDER_IDS, type ApiKeyName, type ProviderId } from '../providers';
import { storeApiKey } from '../secrets';
import { logDetailedError, toUserErrorMessage } from '../utils/errors';
import type { EditMessage, GenerateMessage, InsertMessage, SaveApiKeyMessage } from './messages';

type PostMessage = (message: unknown) => Thenable<boolean>;

export async function handleSaveApiKeyMessage(
  context: vscode.ExtensionContext,
  postMessage: PostMessage,
  msg: SaveApiKeyMessage,
  errorScope: string,
): Promise<void> {
  try {
    if (!isApiKeyName(msg.keyName)) {
      throw new Error(`Invalid API key target: ${msg.keyName}`);
    }

    const value = msg.keyValue.trim();
    if (value.length < 8) {
      throw new Error('API key looks too short.');
    }

    await storeApiKey(context, msg.keyName, value);
    void postMessage({ type: 'keySaved', keyName: msg.keyName });
  } catch (err: unknown) {
    logDetailedError(errorScope, err);
    void postMessage({ type: 'error', message: toUserErrorMessage(err) });
  }
}

export async function handleGenerateMessage(
  context: vscode.ExtensionContext,
  postMessage: PostMessage,
  msg: GenerateMessage,
  signal?: AbortSignal,
): Promise<void> {
  const providerId = validateProvider(msg.provider);

  const result = await generateAndSaveImage(context, {
    prompt: msg.prompt,
    aspectRatio: msg.aspectRatio,
    size: msg.resolution,
    outputQuality: msg.providerQuality,
    quality: msg.quality,
    providerId,
    signal,
  });

  const rawBuffer = await fs.promises.readFile(result.absolutePath);
  postResult(postMessage, result, rawBuffer.toString('base64'));
}

export async function handleEditMessage(
  context: vscode.ExtensionContext,
  postMessage: PostMessage,
  msg: EditMessage,
  signal?: AbortSignal,
): Promise<void> {
  const providerId = validateProvider(msg.provider);

  const result = await editAndSaveImage(context, {
    prompt: msg.prompt,
    inputImageSource: msg.inputImage,
    aspectRatio: msg.aspectRatio,
    outputQuality: msg.providerQuality,
    quality: msg.quality,
    providerId,
    signal,
  });

  const rawBuffer = await fs.promises.readFile(result.absolutePath);
  postResult(postMessage, result, rawBuffer.toString('base64'));
}

export async function handleInsertMessage(msg: InsertMessage): Promise<void> {
  const editor = getLastActiveEditor();

  if (editor && !editor.document.isClosed) {
    await editor.edit((eb) => eb.insert(editor.selection.active, msg.markdownLink));
    void vscode.window.showTextDocument(editor.document, {
      viewColumn: editor.viewColumn,
      preserveFocus: false,
    });
    return;
  }

  await vscode.env.clipboard.writeText(msg.markdownLink);
  void vscode.window.showInformationMessage(
    'ImageGen: No active editor found - Markdown link copied to clipboard.',
  );
}

export function validateProvider(raw: string): ProviderId {
  if ((PROVIDER_IDS as readonly string[]).includes(raw)) {
    return raw as ProviderId;
  }
  throw new Error(`ImageGen: Unknown provider selected: "${raw}"`);
}

function postResult(postMessage: PostMessage, result: Awaited<ReturnType<typeof generateAndSaveImage>>, base64: string): void {
  void postMessage({
    type: 'result',
    base64,
    absolutePath: result.absolutePath,
    relativePath: result.relativePath,
    markdownLink: result.markdownLink,
    originalBytes: result.originalBytes,
    optimizedBytes: result.optimizedBytes,
    metrics: result.metrics,
  });
}

function isApiKeyName(value: string): value is ApiKeyName {
  return (API_KEY_NAMES as readonly string[]).includes(value);
}
