import * as vscode from 'vscode';
import { getConfig } from './image/config';
import type { GenerateResult } from './imageService';
import { PROVIDER_META } from './providers';
import { logDetailedError, toUserErrorMessage } from './utils/errors';

export interface PrepareInvocationInput {
  prompt: string;
  aspectRatio?: string;
  inputImage?: string;
}

export function prepareImageToolInvocation(
  input: PrepareInvocationInput,
  options: {
    invocationVerb: string;
    title: string;
    promptLabel: string;
  },
): vscode.PreparedToolInvocation {
  const { prompt, aspectRatio, inputImage } = input;
  const providerName = resolveConfiguredProviderName();

  return {
    invocationMessage: `${options.invocationVerb} image with ${providerName}: "${prompt}"`,
    confirmationMessages: {
      title: options.title,
      message: new vscode.MarkdownString(
        `**${options.promptLabel}:** ${prompt}` +
          (inputImage ? `\n\n**Input image:** ${inputImage}` : '') +
          (aspectRatio ? `\n\n**Aspect ratio:** ${aspectRatio}` : '') +
          `\n\n**Provider:** ${providerName}`,
      ),
    },
  };
}

export async function invokeImageTool(
  token: vscode.CancellationToken,
  options: {
    progressMessage: string;
    successVerb: string;
    cancelMessage: string;
    errorScope: string;
    errorPrefix: string;
    run: (signal: AbortSignal) => Promise<GenerateResult>;
  },
): Promise<vscode.LanguageModelToolResult> {
  const abortController = new AbortController();
  token.onCancellationRequested(() => abortController.abort());

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Window,
        title: 'ImageGen',
        cancellable: true,
      },
      async (progress, progressCancelToken) => {
        progressCancelToken.onCancellationRequested(() => abortController.abort());
        progress.report({ message: options.progressMessage });
        const res = await options.run(abortController.signal);
        progress.report({ message: 'Encoding to WebP...', increment: 80 });
        return res;
      },
    );

    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `Image ${options.successVerb} successfully and saved to \`${result.relativePath}\`.\n\n` +
          `You can insert it into your document with this Markdown snippet:\n\n` +
          `${result.markdownLink}\n\n` +
          `Call metrics:\n` +
          `- Provider: ${result.metrics.providerId}\n` +
          `- API call duration: ${formatDuration(result.metrics.apiCallDurationMs)}\n` +
          `- Total duration: ${formatDuration(result.metrics.totalDurationMs)}\n` +
          `- Estimated cost: ${formatUsd(result.metrics.estimatedCostUsd)}`,
      ),
    ]);
  } catch (err: unknown) {
    logDetailedError(options.errorScope, err);
    if (abortController.signal.aborted) {
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(options.cancelMessage),
      ]);
    }

    const message = toUserErrorMessage(err);
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(
        `${options.errorPrefix}: ${message}\n\n` +
          `Run **ImageGen: Set API Key** if needed. See the **ImageGen** output channel for details.`,
      ),
    ]);
  }
}

function resolveConfiguredProviderName(): string {
  let providerName = 'configured provider';

  try {
    const config = getConfig();
    const meta = PROVIDER_META.find((m) => m.id === config.provider);
    if (meta) {
      providerName = meta.label;
    }
  } catch {
    // Keep fallback provider name.
  }

  return providerName;
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(3)}`;
}
