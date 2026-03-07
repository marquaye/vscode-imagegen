import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { extractXmpMetadata, parsePromptMetadataXml } from './image/webpMetadata';

export async function inspectImageMetadata(targetUri?: vscode.Uri): Promise<void> {
  const resolvedTargetUri = targetUri ?? await pickTargetImageUri();
  if (!resolvedTargetUri) {
    return;
  }

  await inspectImageMetadataAtUri(resolvedTargetUri);
}

export async function inspectImageMetadataAtPath(filePath: string): Promise<void> {
  await inspectImageMetadataAtUri(vscode.Uri.file(filePath));
}

async function inspectImageMetadataAtUri(targetUri: vscode.Uri): Promise<void> {
  if (!targetUri) {
    return;
  }

  const filePath = targetUri.fsPath;
  if (path.extname(filePath).toLowerCase() !== '.webp') {
    void vscode.window.showWarningMessage('ImageGen: Prompt metadata inspection currently supports .webp files only.');
    return;
  }

  const fileBytes = await fs.promises.readFile(filePath);
  const xmp = extractXmpMetadata(fileBytes);

  if (!xmp) {
    void vscode.window.showInformationMessage('ImageGen: No XMP prompt metadata found in this WebP file.');
    return;
  }

  const parsed = parsePromptMetadataXml(xmp);
  const document = await vscode.workspace.openTextDocument({
    language: 'json',
    content: JSON.stringify(
      {
        filePath,
        prompt: parsed.prompt ?? null,
        providerId: parsed.providerId ?? null,
        aspectRatio: parsed.aspectRatio ?? null,
        operation: parsed.operation ?? null,
        createdAt: parsed.createdAt ?? null,
        creatorTool: parsed.creatorTool ?? null,
        rawXmp: parsed.rawXmp,
      },
      null,
      2,
    ),
  });

  await vscode.window.showTextDocument(document, {
    preview: true,
    viewColumn: vscode.ViewColumn.Beside,
  });
}

async function pickTargetImageUri(): Promise<vscode.Uri | undefined> {
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri?.scheme === 'file' && path.extname(activeUri.fsPath).toLowerCase() === '.webp') {
    return activeUri;
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: 'Inspect WebP Metadata',
    filters: {
      'WebP Images': ['webp'],
    },
  });

  return picked?.[0];
}