import * as vscode from 'vscode';
import { getConfig } from '../image/config';
import { type KeyStatuses } from '../providers';
import { readKeyStatuses } from '../secrets';
import { logDetailedError, toUserErrorMessage } from '../utils/errors';
import { inspectImageMetadataAtPath } from '../inspectMetadata';
import { generateNonce, getWebviewContent } from './webviewContent';
import type { WebviewMessage } from './messages';
import {
  handleEditMessage,
  handleGenerateMessage,
  handleInsertMessage,
  handleSaveApiKeyMessage,
} from './sharedHandlers';

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
      true,
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
      await handleInsertMessage(message);
    } else if (message.type === 'revealFile') {
      void vscode.commands.executeCommand(
        'revealFileInOS',
        vscode.Uri.file(message.absolutePath),
      );
    } else if (message.type === 'openFileInEditor') {
      void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.absolutePath));
    } else if (message.type === 'inspectMetadata') {
      await inspectImageMetadataAtPath(message.absolutePath);
    } else if (message.type === 'saveApiKey') {
      await handleSaveApiKeyMessage(
        this.context,
        (payload) => this.panel.webview.postMessage(payload),
        message,
        'Panel API key save failed',
      );
    } else if (message.type === 'abort') {
      this.activeRequestAbortController?.abort();
    }
  }

  private async handleGenerate(msg: Extract<WebviewMessage, { type: 'generate' }>): Promise<void> {
    const abortController = new AbortController();
    this.activeRequestAbortController = abortController;

    try {
      await handleGenerateMessage(
        this.context,
        (payload) => this.panel.webview.postMessage(payload),
        msg,
        abortController.signal,
      );
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

  private async handleEdit(msg: Extract<WebviewMessage, { type: 'edit' }>): Promise<void> {
    const abortController = new AbortController();
    this.activeRequestAbortController = abortController;

    try {
      await handleEditMessage(
        this.context,
        (payload) => this.panel.webview.postMessage(payload),
        msg,
        abortController.signal,
      );
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

  private readCurrentProvider(): string {
    try {
      return getConfig().provider;
    } catch {
      return 'gemini-3.1-flash-image-preview';
    }
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

