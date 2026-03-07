import * as vscode from 'vscode';
import { getConfig } from '../image/config';
import { readKeyStatuses } from '../secrets';
import { logDetailedError, toUserErrorMessage } from '../utils/errors';
import { generateNonce, getWebviewContent } from './webviewContent';
import type { WebviewMessage } from './messages';
import {
  handleEditMessage,
  handleGenerateMessage,
  handleInsertMessage,
  handleSaveApiKeyMessage,
} from './sharedHandlers';

// ─── Provider ─────────────────────────────────────────────────────────────────

export class SidebarProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'imagegen.sidebarView';

  private _view?: vscode.WebviewView;

  constructor(private readonly context: vscode.ExtensionContext) {}

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _resolveContext: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };

    const initialProvider = this.readCurrentProvider();
    const keyStatuses = await readKeyStatuses(this.context);
    webviewView.webview.html = getWebviewContent(
      webviewView.webview,
      this.context.extensionUri,
      generateNonce(),
      initialProvider,
      keyStatuses,
      false,
    );

    // Push fresh key statuses whenever a secret is added/removed
    this.context.subscriptions.push(
      this.context.secrets.onDidChange(async () => {
        const fresh = await readKeyStatuses(this.context);
        void this._view?.webview.postMessage({ type: 'keyStatusUpdate', keyStatuses: fresh });
      }),
    );

    webviewView.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => this.handleMessage(msg),
      null,
      this.context.subscriptions,
    );
  }

  private readCurrentProvider(): string {
    try {
      return getConfig().provider;
    } catch {
      return 'gemini-3.1-flash-image-preview';
    }
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.type === 'generate') {
      try {
        await handleGenerateMessage(this.context, (payload) => this._view?.webview.postMessage(payload) ?? Promise.resolve(false), message);
      } catch (err: unknown) {
        logDetailedError('Sidebar generation failed', err);
        const userMessage = toUserErrorMessage(err);
        void this._view?.webview.postMessage({ type: 'error', message: userMessage });
      }
    } else if (message.type === 'edit') {
      try {
        await handleEditMessage(this.context, (payload) => this._view?.webview.postMessage(payload) ?? Promise.resolve(false), message);
      } catch (err: unknown) {
        logDetailedError('Sidebar image edit failed', err);
        const userMessage = toUserErrorMessage(err);
        void this._view?.webview.postMessage({ type: 'error', message: userMessage });
      }
    } else if (message.type === 'insert') {
      await handleInsertMessage(message);
    } else if (message.type === 'revealFile') {
      void vscode.commands.executeCommand(
        'revealFileInOS',
        vscode.Uri.file(message.absolutePath),
      );
    } else if (message.type === 'openFileInEditor') {
      void vscode.commands.executeCommand('vscode.open', vscode.Uri.file(message.absolutePath));
    } else if (message.type === 'saveApiKey') {
      await handleSaveApiKeyMessage(
        this.context,
        (payload) => this._view?.webview.postMessage(payload) ?? Promise.resolve(false),
        message,
        'Sidebar API key save failed',
      );
    }
  }
}
