import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getLastActiveEditor } from '../editorTracker';
import type { ProviderId } from '../providers';
import type { SaveMode } from '../tool';
import { embedPromptMetadataInWebp } from './webpMetadata';

export interface OutputArtifact {
  absolutePath: string;
  relativePath: string;
  markdownLink: string;
}

export interface OutputMetadataOptions {
  embedPromptMetadata: boolean;
  providerId: ProviderId;
  aspectRatio: string;
  width: number;
  height: number;
  hasAlpha: boolean;
}

export async function writeOptimizedImage(
  prompt: string,
  filePrefix: 'imagegen' | 'imageedit',
  webpBuffer: Uint8Array,
  outputDirectory: string,
  saveMode: SaveMode,
  metadataOptions: OutputMetadataOptions,
): Promise<OutputArtifact> {
  const workspaceRoot = saveMode === 'persistent'
    ? resolvePreferredWorkspaceRoot()
    : undefined;
  const outDir = saveMode === 'temporary'
    ? getTemporaryOutputDirectory()
    : workspaceRoot
      ? path.join(workspaceRoot, outputDirectory)
      : getStandaloneOutputDirectory();

  await fs.promises.mkdir(outDir, { recursive: true });

  const randomHex = Math.random().toString(16).slice(2, 8);
  const filename = `${filePrefix}-${Date.now()}-${randomHex}.webp`;
  const absolutePath = path.join(outDir, filename);
  const fileBuffer = metadataOptions.embedPromptMetadata
    ? embedPromptMetadataInWebp(webpBuffer, {
        prompt,
        filePrefix,
        providerId: metadataOptions.providerId,
        aspectRatio: metadataOptions.aspectRatio,
        width: metadataOptions.width,
        height: metadataOptions.height,
        hasAlpha: metadataOptions.hasAlpha,
        generatedAt: new Date().toISOString(),
      })
    : webpBuffer;

  await fs.promises.writeFile(absolutePath, fileBuffer);

  const relativePath = workspaceRoot
    ? path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/')
    : absolutePath;

  const altText = promptToSlug(prompt);
  const markdownTarget = workspaceRoot
    ? relativePath
    : vscode.Uri.file(absolutePath).toString();

  return {
    absolutePath,
    relativePath,
    markdownLink: `![${altText}](${markdownTarget})`,
  };
}

function resolvePreferredWorkspaceRoot(): string | undefined {
  const editor = getLastActiveEditor() ?? vscode.window.activeTextEditor;
  const editorWorkspaceRoot = editor
    ? vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath
    : undefined;

  if (editorWorkspaceRoot) {
    return editorWorkspaceRoot;
  }

  return vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
}

function promptToSlug(prompt: string): string {
  const firstSentence = prompt.split(/[.!?]/)[0].trim();
  const truncated = firstSentence.length > 60
    ? firstSentence.slice(0, 57).trimEnd() + '...'
    : firstSentence;

  return truncated || 'Generated Image';
}

function getTemporaryOutputDirectory(): string {
  return path.join(os.tmpdir(), 'ImageGen');
}

function getStandaloneOutputDirectory(): string {
  const picturesDir = path.join(os.homedir(), 'Pictures');
  if (fs.existsSync(picturesDir)) {
    return path.join(picturesDir, 'ImageGen');
  }

  return path.join(os.homedir(), 'ImageGen');
}
