import * as vscode from 'vscode';
import {
  API_KEY_LABELS,
  API_KEY_NAMES,
  PROVIDER_API_KEY_MAP,
  PROVIDER_META,
  type ApiKeyName,
  type KeyStatuses,
  type ProviderId,
} from './providers';

// ─── Get / store / delete ────────────────────────────────────────────────────

export async function getApiKey(
  context: vscode.ExtensionContext,
  keyName: ApiKeyName,
): Promise<string | undefined> {
  return context.secrets.get(keyName);
}

export async function getApiKeyForProvider(
  context: vscode.ExtensionContext,
  providerId: ProviderId,
): Promise<string | undefined> {
  const keyName = PROVIDER_API_KEY_MAP[providerId];
  return context.secrets.get(keyName);
}

export async function storeApiKey(
  context: vscode.ExtensionContext,
  keyName: ApiKeyName,
  value: string,
): Promise<void> {
  await context.secrets.store(keyName, value);
}

// ─── Interactive prompt ───────────────────────────────────────────────────────

/**
 * Shows a QuickPick for the user to choose which API key to set, then
 * prompts for the value and stores it in SecretStorage.
 */
export async function promptAndStoreApiKey(context: vscode.ExtensionContext): Promise<void> {
  // Build the QuickPick items — show which keys are already stored
  type KeyItem = vscode.QuickPickItem & { keyName: ApiKeyName };

  const items: KeyItem[] = await Promise.all(
    API_KEY_NAMES.map(async (keyName) => {
      const existing = await context.secrets.get(keyName);
      return {
        label: API_KEY_LABELS[keyName],
        description: existing ? '$(check) Stored' : '$(warning) Not set',
        detail: getProvidersForKey(keyName),
        keyName,
      };
    }),
  );

  const selected = await vscode.window.showQuickPick(items, {
    title: 'ImageGen: Set API Key',
    placeHolder: 'Select which API key to configure',
  });

  if (!selected) {
    return;
  }

  const value = await vscode.window.showInputBox({
    title: `ImageGen: Enter ${API_KEY_LABELS[selected.keyName]}`,
    prompt: `Paste your ${API_KEY_LABELS[selected.keyName]} below`,
    password: true,
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim().length < 8 ? 'Key looks too short' : undefined),
  });

  if (value === undefined) {
    return; // User cancelled
  }

  await context.secrets.store(selected.keyName, value.trim());
  void vscode.window.showInformationMessage(
    `ImageGen: ${API_KEY_LABELS[selected.keyName]} saved securely.`,
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getProvidersForKey(keyName: ApiKeyName): string {
  const names = PROVIDER_META.filter((m) => m.apiKeyName === keyName).map((m) => m.label);
  return `Used by: ${names.join(', ')}`;
}

/**
 * Returns a map of which API keys are currently set.
 * Used to show live status indicators in the Webview UI.
 */
export async function readKeyStatuses(context: vscode.ExtensionContext): Promise<KeyStatuses> {
  const entries = await Promise.all(
    API_KEY_NAMES.map(async (keyName) => {
      const val = await context.secrets.get(keyName);
      return [keyName, !!val] as const;
    }),
  );
  return Object.fromEntries(entries) as KeyStatuses;
}
