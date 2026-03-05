import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

export interface OutputArtifact {
  absolutePath: string;
  relativePath: string;
  markdownLink: string;
}

export async function writeOptimizedImage(
  prompt: string,
  filePrefix: 'imagegen' | 'imageedit',
  webpBuffer: Uint8Array,
  outputDirectory: string,
): Promise<OutputArtifact> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  const outDir = workspaceRoot
    ? path.join(workspaceRoot, outputDirectory)
    : getStandaloneOutputDirectory();

  await fs.promises.mkdir(outDir, { recursive: true });

  const randomHex = Math.random().toString(16).slice(2, 8);
  const filename = `${filePrefix}-${Date.now()}-${randomHex}.webp`;
  const absolutePath = path.join(outDir, filename);

  await fs.promises.writeFile(absolutePath, webpBuffer);

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

function promptToSlug(prompt: string): string {
  const firstSentence = prompt.split(/[.!?]/)[0].trim();
  const truncated = firstSentence.length > 60
    ? firstSentence.slice(0, 57).trimEnd() + '...'
    : firstSentence;

  return truncated || 'Generated Image';
}

function getStandaloneOutputDirectory(): string {
  const picturesDir = path.join(os.homedir(), 'Pictures');
  if (fs.existsSync(picturesDir)) {
    return path.join(picturesDir, 'ImageGen');
  }

  return path.join(os.homedir(), 'ImageGen');
}
