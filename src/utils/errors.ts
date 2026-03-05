import * as vscode from 'vscode';
import { toUserErrorMessage } from './userErrorMessage';

let imageGenOutput: vscode.OutputChannel | undefined;

export function getImageGenOutputChannel(): vscode.OutputChannel {
  if (!imageGenOutput) {
    imageGenOutput = vscode.window.createOutputChannel('ImageGen');
  }
  return imageGenOutput;
}

export function logDetailedError(scope: string, error: unknown): void {
  const channel = getImageGenOutputChannel();
  const timestamp = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack ?? '' : '';

  channel.appendLine(`[${timestamp}] ${scope}`);
  channel.appendLine(`Message: ${message}`);
  if (stack) {
    channel.appendLine('Stack:');
    channel.appendLine(stack);
  }
  channel.appendLine('');
}

export { toUserErrorMessage };
