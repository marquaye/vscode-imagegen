import { PROVIDER_USD_PER_1K_IMAGES, type ProviderId } from '../providers';

/**
 * How a saved image is reported back to an agent.
 *
 * This lives apart from the server entry point so it can be tested without
 * starting a stdio transport.
 */
export interface ImageResultFacts {
  outputPath: string;
  prompt: string;
  providerId: ProviderId;
  width: number;
  height: number;
  savedBytes: number;
  originalBytes: number;
  apiCallDurationMs: number;
}

/**
 * Three short lines carry everything the previous JSON payload did — path,
 * dimensions, compression, model, duration and cost — at roughly a third of
 * the context cost, and the Markdown link is ready to paste.
 */
export function formatImageResult(facts: ImageResultFacts): string {
  const costUsd = PROVIDER_USD_PER_1K_IMAGES[facts.providerId] / 1000;
  return [
    `Saved ${facts.outputPath}`,
    `${facts.width}x${facts.height} · ${formatBytes(facts.savedBytes)} `
      + `(from ${formatBytes(facts.originalBytes)}) · ${facts.providerId} · `
      + `${(facts.apiCallDurationMs / 1000).toFixed(1)}s · ~$${costUsd.toFixed(3)}`,
    `![${promptToSlug(facts.prompt)}](${facts.outputPath})`,
  ].join('\n');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Alt text for the Markdown link: the prompt's first sentence, capped. */
function promptToSlug(prompt: string): string {
  const firstSentence = prompt.split(/[.!?]/)[0].trim();
  return firstSentence.length > 60 ? `${firstSentence.slice(0, 57).trimEnd()}...` : firstSentence || 'Generated Image';
}
