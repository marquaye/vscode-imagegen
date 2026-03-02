import * as vscode from 'vscode';
import { initWasm } from './imageService';
import { promptAndStoreApiKey } from './secrets';
import { EditImageTool, GenerateImageTool } from './tool';
import { ImageGenPanel } from './webview/panel';
import { SidebarProvider } from './webview/sidebarProvider';
import { initEditorTracker } from './editorTracker';
import { runHealthCheck } from './healthCheck';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // ── 1. Track last active text editor (fixes Insert when webview has focus) ─
  initEditorTracker(context);

  // ── 2. Initialize WebAssembly encoder ──────────────────────────────────────
  try {
    await initWasm(context.extensionPath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(
      `ImageGen: Failed to initialize WebAssembly encoder. ${message}`,
    );
  }

  // ── 3. Register sidebar WebviewViewProvider ─────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      new SidebarProvider(context),
    ),
  );

  // ── 4. Command: Set API Key ─────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('imagegen.setApiKey', async () => {
      await promptAndStoreApiKey(context);
    }),
  );

  // ── 5. Command: Open as floating Editor Panel ───────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('imagegen.openPanel', async () => {
      await ImageGenPanel.createOrShow(context);
    }),
  );

  // ── 6. Copilot Tool registration ────────────────────────────────────────────
  context.subscriptions.push(
    vscode.lm.registerTool('imagegen_generateImage', new GenerateImageTool(context)),
  );
  context.subscriptions.push(
    vscode.lm.registerTool('imagegen_editImage', new EditImageTool(context)),
  );

  // ── 7. Command: Health check ────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('imagegen.runHealthCheck', async () => {
      await runHealthCheck(context);
    }),
  );
}

export function deactivate(): void {
  // All disposables are in context.subscriptions — VS Code cleans them up
}
