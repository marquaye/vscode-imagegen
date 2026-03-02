import * as vscode from 'vscode';

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

export function toUserErrorMessage(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error)).trim();
  const lower = raw.toLowerCase();

  if (lower.includes('cancel')) {
    return 'Request cancelled.';
  }

  if (lower.includes('no api key set')) {
    return 'API key is missing for the selected provider. Run “ImageGen: Set API Key”.';
  }

  if (lower.includes('401') || lower.includes('unauthorized')) {
    return 'Authentication failed. Check your API key for the selected provider.';
  }

  if (lower.includes('403') || lower.includes('forbidden')) {
    return 'Access denied by provider. Verify API key permissions and account access.';
  }

  if (lower.includes('429') || lower.includes('rate limit')) {
    return 'Provider rate limit reached. Wait a moment and try again.';
  }

  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504')
  ) {
    return 'Provider is temporarily unavailable. Please retry in a moment.';
  }

  if (lower.includes('wasm encoder has not been initialized')) {
    return 'Image encoder is not ready yet. Reload the VS Code window and try again.';
  }

  if (lower.includes('no workspace folder is open')) {
    return 'Open a workspace folder before generating images.';
  }

  if (lower.includes('unsupported image type')) {
    return 'Provider returned an unsupported image format.';
  }

  return raw || 'Unexpected error occurred while generating image.';
}
