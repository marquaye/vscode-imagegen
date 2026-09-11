import { geminiFlashProvider, geminiProProvider } from './gemini';
import {
  openAI15Provider,
  openAI25FlareProvider,
  openAI25SunburstProvider,
  openAI2Provider,
} from './openai';
import {
  fluxMaxProvider,
  fluxProProvider,
  maiImage26FlashProvider,
  maiImage26Provider,
  seedreamProvider,
} from './openrouter';
import type { ImageProvider, ProviderId } from './types';

export * from './types';

const PROVIDERS: Record<ProviderId, ImageProvider> = {
  'gemini-3.1-flash-image-preview': geminiFlashProvider,
  'gemini-3-pro-image-preview': geminiProProvider,
  'gpt-image-2.5-flare': openAI25FlareProvider,
  'gpt-image-2.5-sunburst': openAI25SunburstProvider,
  'gpt-image-2': openAI2Provider,
  'gpt-image-1.5': openAI15Provider,
  'mai-image-2.6': maiImage26Provider,
  'mai-image-2.6-flash': maiImage26FlashProvider,
  'flux-2-max': fluxMaxProvider,
  'flux-2-pro': fluxProProvider,
  'seedream-4.0': seedreamProvider,
};

export function getProvider(id: ProviderId): ImageProvider {
  const p = PROVIDERS[id];
  if (!p) {
    throw new Error(`Unknown provider ID: "${id}". Valid values: ${Object.keys(PROVIDERS).join(', ')}`);
  }
  return p;
}
