import * as vscode from 'vscode';
import { PROVIDER_IDS, type ProviderId } from '../providers';

export interface ImageGenConfig {
  provider: ProviderId;
  outputDirectory: string;
  webpQuality: number;
  requestTimeoutMs: number;
  maxInputImageMB: number;
}

export function getConfig(): ImageGenConfig {
  const cfg = vscode.workspace.getConfiguration('imagegen');
  const provider = cfg.get<string>('provider', 'gemini-3.1-flash-image-preview');

  if (!(PROVIDER_IDS as readonly string[]).includes(provider)) {
    throw new Error(`ImageGen: Unknown provider "${provider}" in settings.`);
  }

  return {
    provider: provider as ProviderId,
    outputDirectory: cfg.get<string>('outputDirectory', 'assets/images'),
    webpQuality: cfg.get<number>('webpQuality', 80),
    requestTimeoutMs: cfg.get<number>('requestTimeoutMs', 45000),
    maxInputImageMB: cfg.get<number>('maxInputImageMB', 12),
  };
}
