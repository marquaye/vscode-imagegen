import * as fs from 'fs';
import * as vscode from 'vscode';
import { editAndSaveImage, generateAndSaveImage, getConfig } from '../imageService';
import { API_KEY_NAMES, type ApiKeyName, type ProviderId, PROVIDER_IDS, type KeyStatuses } from '../providers';
import { getLastActiveEditor } from '../editorTracker';
import { readKeyStatuses, storeApiKey } from '../secrets';
import { logDetailedError, toUserErrorMessage } from '../utils/errors';
import { generateNonce, getWebviewContent } from './webviewContent';

// ─── Message types ────────────────────────────────────────────────────────────

interface GenerateMessage {
  type: 'generate';
  prompt: string;
  provider: string;
  aspectRatio: string;
  resolution?: string;
  providerQuality?: string;
  quality: number;
}

interface EditMessage {
  type: 'edit';
  prompt: string;
  inputImage: string;
  provider: string;
  aspectRatio: string;
  providerQuality?: string;
  quality: number;
}

interface InsertMessage {
  type: 'insert';
  markdownLink: string;
}

interface RevealFileMessage {
  type: 'revealFile';
  absolutePath: string;
}

interface OpenFileInEditorMessage {
  type: 'openFileInEditor';
  absolutePath: string;
}

interface SaveApiKeyMessage {
  type: 'saveApiKey';
  keyName: string;
  keyValue: string;
}

interface AbortMessage {
  type: 'abort';
}

type WebviewMessage =
  | GenerateMessage
  | EditMessage
  | InsertMessage
  | RevealFileMessage
  | OpenFileInEditorMessage
  | SaveApiKeyMessage
  | AbortMessage;

// ─── Panel ────────────────────────────────────────────────────────────────────

export class ImageGenPanel {
  static currentPanel: ImageGenPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private readonly disposables: vscode.Disposable[] = [];
  private activeRequestAbortController?: AbortController;

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    keyStatuses: KeyStatuses,
  ) {
    this.panel = panel;
    this.context = context;

    const initialProvider = this.readCurrentProvider();
    this.panel.webview.html = getWebviewContent(
      this.panel.webview,
      context.extensionUri,
      generateNonce(),
      initialProvider,
      keyStatuses,
    );

    // Push fresh key statuses whenever a secret is added/removed
    context.subscriptions.push(
      context.secrets.onDidChange(async () => {
        const fresh = await readKeyStatuses(context);
        void this.panel.webview.postMessage({ type: 'keyStatusUpdate', keyStatuses: fresh });
      }),
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleMessage(msg),
      null,
      this.disposables,
    );
  }

  static async createOrShow(context: vscode.ExtensionContext): Promise<void> {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside
      : vscode.ViewColumn.One;

    if (ImageGenPanel.currentPanel) {
      ImageGenPanel.currentPanel.panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'imagegen',
      'ImageGen',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );

    const keyStatuses = await readKeyStatuses(context);
    ImageGenPanel.currentPanel = new ImageGenPanel(panel, context, keyStatuses);
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === 'generate') {
      await this.handleGenerate(message);
    } else if (message.type === 'edit') {
      await this.handleEdit(message);
    } else if (message.type === 'insert') {
      await this.handleInsert(message);
    } else if (message.type === 'revealFile') {
      void vscode.commands.executeCommand(
        'revealFileInOS',
        vscode.Uri.file(message.absolutePath),
      );
    } else if (message.type === 'openFileInEditor') {
      void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.absolutePath));
    } else if (message.type === 'saveApiKey') {
      await this.handleSaveApiKey(message);
    } else if (message.type === 'abort') {
      this.activeRequestAbortController?.abort();
    }
  }

  private async handleSaveApiKey(msg: SaveApiKeyMessage): Promise<void> {
    try {
      if (!isApiKeyName(msg.keyName)) {
        throw new Error(`Invalid API key target: ${msg.keyName}`);
      }

      const value = msg.keyValue.trim();
      if (value.length < 8) {
        throw new Error('API key looks too short.');
      }

      await storeApiKey(this.context, msg.keyName, value);
      void this.panel.webview.postMessage({ type: 'keySaved', keyName: msg.keyName });
    } catch (err: unknown) {
      logDetailedError('Panel API key save failed', err);
      void this.panel.webview.postMessage({ type: 'error', message: toUserErrorMessage(err) });
    }
  }

  private async handleGenerate(msg: GenerateMessage): Promise<void> {
    const abortController = new AbortController();
    this.activeRequestAbortController = abortController;

    try {
      const providerId = this.validateProvider(msg.provider);

      const result = await generateAndSaveImage(this.context, {
        prompt: msg.prompt,
        aspectRatio: msg.aspectRatio,
        size: msg.resolution,
        outputQuality: msg.providerQuality,
        quality: msg.quality,
        providerId,
        signal: abortController.signal,
      });

      const rawBuffer = await fs.promises.readFile(result.absolutePath);
      const base64 = rawBuffer.toString('base64');

      void this.panel.webview.postMessage({
        type: 'result',
        base64,
        absolutePath: result.absolutePath,
        relativePath: result.relativePath,
        markdownLink: result.markdownLink,
        originalBytes: result.originalBytes,
        optimizedBytes: result.optimizedBytes,
        metrics: result.metrics,
      });
    } catch (err: unknown) {
      logDetailedError('Panel generation failed', err);
      if (abortController.signal.aborted || isAbortLikeError(err)) {
        void this.panel.webview.postMessage({ type: 'cancelled' });
        return;
      }
      const message = toUserErrorMessage(err);
      void this.panel.webview.postMessage({ type: 'error', message });
    } finally {
      if (this.activeRequestAbortController === abortController) {
        this.activeRequestAbortController = undefined;
      }
    }
  }

  private async handleEdit(msg: EditMessage): Promise<void> {
    const abortController = new AbortController();
    this.activeRequestAbortController = abortController;

    try {
      const providerId = this.validateProvider(msg.provider);

      const result = await editAndSaveImage(this.context, {
        prompt: msg.prompt,
        inputImageSource: msg.inputImage,
        aspectRatio: msg.aspectRatio,
        outputQuality: msg.providerQuality,
        quality: msg.quality,
        providerId,
        signal: abortController.signal,
      });

      const rawBuffer = await fs.promises.readFile(result.absolutePath);
      const base64 = rawBuffer.toString('base64');

      void this.panel.webview.postMessage({
        type: 'result',
        base64,
        absolutePath: result.absolutePath,
        relativePath: result.relativePath,
        markdownLink: result.markdownLink,
        originalBytes: result.originalBytes,
        optimizedBytes: result.optimizedBytes,
        metrics: result.metrics,
      });
    } catch (err: unknown) {
      logDetailedError('Panel image edit failed', err);
      if (abortController.signal.aborted || isAbortLikeError(err)) {
        void this.panel.webview.postMessage({ type: 'cancelled' });
        return;
      }
      const message = toUserErrorMessage(err);
      void this.panel.webview.postMessage({ type: 'error', message });
    } finally {
      if (this.activeRequestAbortController === abortController) {
        this.activeRequestAbortController = undefined;
      }
    }
  }

  private async handleInsert(msg: InsertMessage): Promise<void> {
    const editor = getLastActiveEditor();

    if (editor && !editor.document.isClosed) {
      await editor.edit((eb) => eb.insert(editor.selection.active, msg.markdownLink));
      void vscode.window.showTextDocument(editor.document, {
        viewColumn: editor.viewColumn,
        preserveFocus: false,
      });
    } else {
      // Fallback: copy to clipboard
      await vscode.env.clipboard.writeText(msg.markdownLink);
      void vscode.window.showInformationMessage(
        'ImageGen: No active editor found — Markdown link copied to clipboard.',
      );
    }
  }

  private readCurrentProvider(): string {
    try {
      return getConfig().provider;
    } catch {
      return 'gemini-3.1-flash-image-preview';
    }
  }

  private validateProvider(raw: string): ProviderId {
    if ((PROVIDER_IDS as readonly string[]).includes(raw)) {
      return raw as ProviderId;
    }
    throw new Error(`ImageGen: Unknown provider selected: "${raw}"`);
  }

  private dispose(): void {
    ImageGenPanel.currentPanel = undefined;
    this.panel.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

function isAbortLikeError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') {
    return true;
  }

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('abort') || msg.includes('cancel');
  }

  return false;
}

function isApiKeyName(value: string): value is ApiKeyName {
  return (API_KEY_NAMES as readonly string[]).includes(value);
}
