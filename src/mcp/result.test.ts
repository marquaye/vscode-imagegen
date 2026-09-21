import { describe, expect, it } from 'bun:test';
import { formatBytes, formatImageResult, type ImageResultFacts } from './resultFormat';

const facts: ImageResultFacts = {
  outputPath: 'assets/images/imagegen-1758452000-a1b2c3.webp',
  prompt: 'A red fox in deep snow at dawn. Shot on 85mm.',
  providerId: 'gemini-3.1-flash-image-preview',
  width: 1536,
  height: 1024,
  savedBytes: 94_208,
  originalBytes: 1_468_006,
  apiCallDurationMs: 4230,
};

/** The payload the server returned before the 1.4.0 response rewrite. */
function legacyPayload(): string {
  return JSON.stringify(
    {
      absolutePath: `D:\\Projects\\demo\\${facts.outputPath.replace(/\//g, '\\')}`,
      relativePath: facts.outputPath,
      markdownLink: `![A red fox in deep snow at dawn](${facts.outputPath})`,
      width: facts.width,
      height: facts.height,
      originalBytes: facts.originalBytes,
      optimizedBytes: facts.savedBytes,
      metrics: {
        providerId: facts.providerId,
        apiCallDurationMs: facts.apiCallDurationMs,
        totalDurationMs: facts.apiCallDurationMs + 180,
        estimatedCostUsd: 0.067,
      },
    },
    null,
    2,
  );
}

describe('formatBytes', () => {
  it('scales the unit to the size', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(94_208)).toBe('92 KB');
    expect(formatBytes(1_468_006)).toBe('1.4 MB');
  });
});

describe('formatImageResult', () => {
  it('reports path, dimensions, compression, model, duration and cost', () => {
    const result = formatImageResult(facts);
    expect(result).toBe(
      'Saved assets/images/imagegen-1758452000-a1b2c3.webp\n'
        + '1536x1024 · 92 KB (from 1.4 MB) · gemini-3.1-flash-image-preview · 4.2s · ~$0.067\n'
        + '![A red fox in deep snow at dawn](assets/images/imagegen-1758452000-a1b2c3.webp)',
    );
  });

  it('ends with a Markdown link the agent can paste unchanged', () => {
    const lines = formatImageResult(facts).split('\n');
    expect(lines[lines.length - 1]).toBe(`![A red fox in deep snow at dawn](${facts.outputPath})`);
  });

  it('truncates an overlong prompt in the link text', () => {
    const result = formatImageResult({ ...facts, prompt: 'x'.repeat(200) });
    expect(result).toContain(`![${'x'.repeat(57)}...]`);
  });

  it('stays well under half the size of the payload it replaced', () => {
    expect(formatImageResult(facts).length).toBeLessThan(legacyPayload().length / 2);
  });
});
