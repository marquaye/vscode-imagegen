import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  aspectRatioToOpenAISize,
  PROVIDER_API_KEY_MAP,
  PROVIDER_CAPABILITIES,
  PROVIDER_IDS,
  PROVIDER_META,
  PROVIDER_USD_PER_1K_IMAGES,
} from './types';

/** The slice of package.json that has to stay in step with the provider tables. */
interface ExtensionManifest {
  contributes: {
    configuration: {
      properties: {
        'imagegen.provider': { default: string; enum: string[]; enumDescriptions: string[] };
      };
    };
  };
}

function readManifest(): ExtensionManifest {
  const manifestPath = join(__dirname, '..', '..', 'package.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as ExtensionManifest;
}

describe('aspectRatioToOpenAISize', () => {
  it('maps square ratio to 1024x1024', () => {
    expect(aspectRatioToOpenAISize('1:1')).toBe('1024x1024');
  });

  it('maps landscape ratio to 1536x1024', () => {
    expect(aspectRatioToOpenAISize('16:9')).toBe('1536x1024');
  });

  it('maps portrait ratio to 1024x1536', () => {
    expect(aspectRatioToOpenAISize('9:16')).toBe('1024x1536');
  });

  it('falls back to auto for invalid ratio input', () => {
    expect(aspectRatioToOpenAISize('oops')).toBe('auto');
  });
});

describe('provider tables', () => {
  it('covers every provider ID in each lookup table', () => {
    for (const id of PROVIDER_IDS) {
      expect(PROVIDER_API_KEY_MAP[id]).toBeDefined();
      expect(PROVIDER_CAPABILITIES[id]).toBeDefined();
      expect(PROVIDER_USD_PER_1K_IMAGES[id]).toBeGreaterThan(0);
      expect(PROVIDER_META.some((m) => m.id === id)).toBe(true);
    }
  });

  it('lists providers in the UI in the same order as PROVIDER_IDS', () => {
    expect(PROVIDER_META.map((m) => m.id)).toEqual([...PROVIDER_IDS]);
  });

  it('offers a default quality tier that the model actually accepts', () => {
    for (const id of PROVIDER_IDS) {
      const caps = PROVIDER_CAPABILITIES[id];
      if (caps.qualityTiers.length === 0) {
        expect(caps.defaultQualityTier).toBeUndefined();
        continue;
      }
      expect(caps.qualityTiers).toContain(caps.defaultQualityTier);
    }
  });

  it('offers every provider ID in the package.json setting enum', () => {
    const setting = readManifest().contributes.configuration.properties['imagegen.provider'];

    expect(setting.enum).toEqual([...PROVIDER_IDS]);
    // enum and enumDescriptions are matched positionally by VS Code.
    expect(setting.enumDescriptions).toHaveLength(setting.enum.length);
    expect(PROVIDER_IDS).toContain(setting.default);
  });

  it('exposes the extended GPT Image 2.5 quality tiers', () => {
    for (const id of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst'] as const) {
      expect(PROVIDER_CAPABILITIES[id].qualityTiers).toContain('xhigh');
      expect(PROVIDER_CAPABILITIES[id].qualityTiers).toContain('max');
    }

    // The older OpenAI models stop at `high`.
    expect(PROVIDER_CAPABILITIES['gpt-image-2'].qualityTiers).not.toContain('xhigh');
  });
});
