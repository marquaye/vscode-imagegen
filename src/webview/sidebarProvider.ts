import * as fs from 'fs';
import * as vscode from 'vscode';
import { generateAndSaveImage, getConfig } from '../imageService';
import { API_KEY_NAMES, type ApiKeyName, type ProviderId, PROVIDER_IDS } from '../providers';
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

type WebviewMessage =
  | GenerateMessage
  | InsertMessage
  | RevealFileMessage
  | OpenFileInEditorMessage
  | SaveApiKeyMessage;

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
      await this.handleGenerate(message);
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
      void this._view?.webview.postMessage({ type: 'keySaved', keyName: msg.keyName });
    } catch (err: unknown) {
      logDetailedError('Sidebar API key save failed', err);
      void this._view?.webview.postMessage({ type: 'error', message: toUserErrorMessage(err) });
    }
  }

  private async handleGenerate(msg: GenerateMessage): Promise<void> {
    try {
      const providerId = this.validateProvider(msg.provider);

      const result = await generateAndSaveImage(this.context, {
        prompt: msg.prompt,
        aspectRatio: msg.aspectRatio,
        quality: msg.quality,
        providerId,
      });

      const rawBuffer = fs.readFileSync(result.absolutePath);
      const base64 = rawBuffer.toString('base64');

      void this._view?.webview.postMessage({
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
      logDetailedError('Sidebar generation failed', err);
      const message = toUserErrorMessage(err);
      void this._view?.webview.postMessage({ type: 'error', message });
    }
  }

  private async handleInsert(msg: InsertMessage): Promise<void> {
    const editor = getLastActiveEditor();

    if (editor && !editor.document.isClosed) {
      await editor.edit((eb) => eb.insert(editor.selection.active, msg.markdownLink));
      // Bring the editor into view
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

  private validateProvider(raw: string): ProviderId {
    if ((PROVIDER_IDS as readonly string[]).includes(raw)) {
      return raw as ProviderId;
    }
    throw new Error(`ImageGen: Unknown provider: "${raw}"`);
  }
}

function isApiKeyName(value: string): value is ApiKeyName {
  return (API_KEY_NAMES as readonly string[]).includes(value);
}
