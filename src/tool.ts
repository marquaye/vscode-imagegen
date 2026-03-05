import * as vscode from 'vscode';
import { editAndSaveImage, generateAndSaveImage } from './imageService';
import type { AspectRatio } from './providers/types';
import { invokeImageTool, prepareImageToolInvocation } from './lmToolRunner';

export interface IGenerateImageInput {
  prompt: string;
  aspectRatio?: AspectRatio;
}

export interface IEditImageInput {
  prompt: string;
  inputImage: string;
  aspectRatio?: AspectRatio;
}

export class GenerateImageTool implements vscode.LanguageModelTool<IGenerateImageInput> {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IGenerateImageInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return prepareImageToolInvocation(options.input, {
      invocationVerb: 'Generating',
      title: 'Generate Image',
      promptLabel: 'Prompt',
    });
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IGenerateImageInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { prompt, aspectRatio } = options.input;
    return invokeImageTool(token, {
      progressMessage: 'Calling image generation API...',
      successVerb: 'generated',
      cancelMessage: 'Image generation cancelled.',
      errorScope: 'Copilot tool generation failed',
      errorPrefix: '❌ Image generation failed',
      run: (signal) =>
        generateAndSaveImage(this.context, {
          prompt,
          aspectRatio: aspectRatio ?? '16:9',
          signal,
        }),
    });
  }
}

export class EditImageTool implements vscode.LanguageModelTool<IEditImageInput> {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async prepareInvocation(
    options: vscode.LanguageModelToolInvocationPrepareOptions<IEditImageInput>,
    _token: vscode.CancellationToken,
  ): Promise<vscode.PreparedToolInvocation> {
    return prepareImageToolInvocation(options.input, {
      invocationVerb: 'Editing',
      title: 'Edit Image',
      promptLabel: 'Edit prompt',
    });
  }

  async invoke(
    options: vscode.LanguageModelToolInvocationOptions<IEditImageInput>,
    token: vscode.CancellationToken,
  ): Promise<vscode.LanguageModelToolResult> {
    const { prompt, inputImage, aspectRatio } = options.input;
    return invokeImageTool(token, {
      progressMessage: 'Loading source image...',
      successVerb: 'edited',
      cancelMessage: 'Image editing cancelled.',
      errorScope: 'Copilot tool image edit failed',
      errorPrefix: '❌ Image editing failed',
      run: (signal) =>
        editAndSaveImage(this.context, {
          prompt,
          inputImageSource: inputImage,
          aspectRatio: aspectRatio ?? '16:9',
          signal,
        }),
    });
  }
}
