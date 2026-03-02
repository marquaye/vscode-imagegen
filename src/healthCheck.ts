import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './imageService';
import { getProvider } from './providers';
import { getApiKeyForProvider } from './secrets';
import { fetchWithRetry } from './utils/network';

export async function runHealthCheck(context: vscode.ExtensionContext): Promise<void> {
  const lines: string[] = [];
  const config = getConfig();

  lines.push(`ImageGen health check`);
  lines.push(`Provider: ${config.provider}`);

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  if (!workspaceRoot) {
    void vscode.window.showErrorMessage('ImageGen health check failed: no workspace folder open.');
    return;
  }

  const provider = getProvider(config.provider);
  const apiKey = await getApiKeyForProvider(context, config.provider);

  if (!apiKey) {
    lines.push(`❌ API key missing for provider (${provider.apiKeyLabel}).`);
  } else {
    lines.push(`✅ API key found (${provider.apiKeyLabel}).`);
  }

  const outputDir = path.join(workspaceRoot, config.outputDirectory);
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const probePath = path.join(outputDir, `.imagegen-health-${Date.now()}.tmp`);
    fs.writeFileSync(probePath, 'ok');
    fs.unlinkSync(probePath);
    lines.push(`✅ Output directory writable: ${config.outputDirectory}`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    lines.push(`❌ Output directory not writable (${config.outputDirectory}): ${message}`);
  }

  if (apiKey) {
    const endpointResult = await checkProviderEndpoint(config.provider, apiKey);
    lines.push(endpointResult.ok ? `✅ ${endpointResult.message}` : `❌ ${endpointResult.message}`);
  } else {
    lines.push('⚠️ Skipped endpoint check because API key is missing.');
  }

  const output = lines.join(os.EOL);

  const channel = vscode.window.createOutputChannel('ImageGen Health Check');
  channel.clear();
  channel.appendLine(output);
  channel.show(true);

  const hasFailure = lines.some((line) => line.startsWith('❌'));
  if (hasFailure) {
    void vscode.window.showWarningMessage('ImageGen health check completed with issues. See output panel.');
  } else {
    void vscode.window.showInformationMessage('ImageGen health check passed.');
  }
}

async function checkProviderEndpoint(
  providerId: string,
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const request = endpointRequest(providerId, apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetchWithRetry(
      request.url,
      { method: 'GET', headers: request.headers, signal: controller.signal },
      { retries: 1, signal: controller.signal },
    );

    if (response.ok) {
      return { ok: true, message: `Endpoint reachable and authorized: ${request.label}` };
    }

    const text = await response.text();
    return {
      ok: false,
      message: `Endpoint check failed (${request.label}) ${response.status}: ${truncate(text)}`,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `Endpoint check error (${request.label}): ${message}` };
  } finally {
    clearTimeout(timer);
  }
}

function endpointRequest(providerId: string, apiKey: string): {
  url: string;
  headers: Record<string, string>;
  label: string;
} {
  if (providerId.startsWith('gemini-')) {
    return {
      url: 'https://generativelanguage.googleapis.com/v1beta/models',
      headers: { 'x-goog-api-key': apiKey },
      label: 'Google Gemini models API',
    };
  }

  if (providerId === 'gpt-image-1.5') {
    return {
      url: 'https://api.openai.com/v1/models',
      headers: { Authorization: `Bearer ${apiKey}` },
      label: 'OpenAI models API',
    };
  }

  return {
    url: 'https://openrouter.ai/api/v1/models',
    headers: { Authorization: `Bearer ${apiKey}` },
    label: 'OpenRouter models API',
  };
}

function truncate(text: string, max = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 1)}…`;
}
