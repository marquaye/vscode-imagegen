import * as vscode from 'vscode';
import { generateAndSaveImage, getConfig } from './imageService';
import { PROVIDER_META, type ProviderId } from './providers';
import type { AspectRatio } from './providers/types';
import { logDetailedError, toUserErrorMessage } from './utils/errors';

export interface IGenerateImageInput {
  prompt: string;
  aspectRatio?: AspectRatio;
}

export class GenerateImageTool implements vscode.LanguageModelTool<IGenerateImageInput> {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IGenerateImageInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    const { prompt, aspectRatio } = options.input;
    let providerName = 'configured provider';

    try {
      const config = getConfig();
      const meta = PROVIDER_META.find((m) => m.id === config.provider);
      if (meta) {
        providerName = meta.label;
      }
    } catch {
      // Ignore — just show a fallback name
    }

    return {
      invocationMessage: `Generating image with ${providerName}: "${prompt}"`,
      confirmationMessages: {
        title: 'Generate Image',
        message: new vscode.MarkdownString(
          `**Prompt:** ${prompt}` +
            (aspectRatio ? `\n\n**Aspect ratio:** ${aspectRatio}` : '') +
            `\n\n**Provider:** ${providerName}`,
        ),
      },
    };
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IGenerateImageInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { prompt, aspectRatio } = options.input;
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
          progress.report({ message: 'Calling image generation API…' });
          const res = await generateAndSaveImage(this.context, {
            prompt,
            aspectRatio: aspectRatio ?? '16:9',
            signal: abortController.signal,
          });
          progress.report({ message: 'Encoding to WebP…', increment: 80 });
          return res;
        },
      );

      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `Image generated successfully and saved to \`${result.relativePath}\`.\n\n` +
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
      logDetailedError('Copilot tool generation failed', err);
      if (abortController.signal.aborted) {
        return new vscode.LanguageModelToolResult([
          new vscode.LanguageModelTextPart('Image generation cancelled.'),
        ]);
      }
      const message = toUserErrorMessage(err);
      return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(
          `❌ Image generation failed: ${message}\n\n` +
            `Run **ImageGen: Set API Key** if needed. See the **ImageGen** output channel for details.`,
        ),
      ]);
    }
  }
}

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatUsd(value: number): string {
  return `$${value.toFixed(3)}`;
}
