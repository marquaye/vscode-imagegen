import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { InputImageData } from '../providers/types';
import { fetchWithRetry } from '../utils/network';
import { assertInputImageSize, inferMimeTypeFromPathname } from './inputRules';

const DATA_URL_RE = /^data:(?<mime>[^;]+);base64,(?<data>[\s\S]+)$/i;
const MARKDOWN_IMAGE_RE = /^!\[[^\]]*\]\((?<path>[^)]+)\)$/;

export async function resolveInputImageSource(
  source: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<InputImageData> {
  const trimmed = source.trim();
  if (!trimmed) {
    throw new Error('ImageGen: inputImage is required for image editing.');
  }

  const markdownMatch = trimmed.match(MARKDOWN_IMAGE_RE);
  const resolvedSource = markdownMatch?.groups?.path?.trim() ?? trimmed;

  const dataUrlMatch = resolvedSource.match(DATA_URL_RE);
  if (dataUrlMatch?.groups?.mime && dataUrlMatch.groups.data) {
    const rawBuffer = Buffer.from(dataUrlMatch.groups.data, 'base64');
    assertInputImageSize(rawBuffer.byteLength, maxBytes);
    return {
      mimeType: dataUrlMatch.groups.mime.toLowerCase(),
      rawBuffer,
    };
  }

  if (/^https?:\/\//i.test(resolvedSource)) {
    const res = await fetchWithRetry(resolvedSource, { signal }, { signal });
    if (!res.ok) {
      throw new Error(`ImageGen: Failed to download input image (${res.status}).`);
    }

    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isNaN(contentLength)) {
        assertInputImageSize(contentLength, maxBytes);
      }
    }

    const arrayBuffer = await res.arrayBuffer();
    assertInputImageSize(arrayBuffer.byteLength, maxBytes);
    const contentType = res.headers.get('content-type')?.split(';')[0]?.toLowerCase();

    return {
      mimeType: contentType && contentType.startsWith('image/')
        ? contentType
        : inferMimeTypeFromPathname(resolvedSource),
      rawBuffer: Buffer.from(arrayBuffer),
    };
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  const localPath = path.isAbsolute(resolvedSource)
    ? resolvedSource
    : workspaceRoot
      ? path.join(workspaceRoot, resolvedSource)
      : '';

  if (!path.isAbsolute(resolvedSource) && !workspaceRoot) {
    throw new Error(
      'ImageGen: Relative input image paths require an open workspace. Use an absolute path, URL, or data URL.',
    );
  }

  try {
    await fs.promises.access(localPath, fs.constants.R_OK);
  } catch {
    throw new Error(`ImageGen: Input image not found at "${resolvedSource}".`);
  }

  const localStats = await fs.promises.stat(localPath);
  assertInputImageSize(localStats.size, maxBytes);

  return {
    mimeType: inferMimeTypeFromPathname(localPath),
    rawBuffer: await fs.promises.readFile(localPath),
  };
}

