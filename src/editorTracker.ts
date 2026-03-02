import * as vscode from 'vscode';

/**
 * Tracks the last active text editor.
 *
 * The problem: when a WebviewPanel or WebviewView gains focus,
 * `vscode.window.activeTextEditor` becomes `undefined`.
 * This tracker stores the last editor that WAS active before focus
 * moved to a webview, so Insert actions have a reliable target.
 */
let _lastEditor: vscode.TextEditor | undefined;

export function initEditorTracker(context: vscode.ExtensionContext): void {
  // Seed with whatever is active now
  _lastEditor = vscode.window.activeTextEditor;

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      // Only update when a real text editor becomes active (not webview focus steals)
      if (editor) {
        _lastEditor = editor;
      }
    }),
  );
}

export function getLastActiveEditor(): vscode.TextEditor | undefined {
  // Double-check: if the stored editor's document has been closed, return undefined
  if (_lastEditor && _lastEditor.document.isClosed) {
    _lastEditor = undefined;
  }
  return _lastEditor;
}
