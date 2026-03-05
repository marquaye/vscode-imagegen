export function toUserErrorMessage(error: unknown): string {
  const raw = (error instanceof Error ? error.message : String(error)).trim();
  const lower = raw.toLowerCase();

  if (lower.includes('cancel')) {
    return 'Request cancelled.';
  }

  if (lower.includes('timed out') || lower.includes('timeout')) {
    return 'Request timed out. Try again or increase imagegen.requestTimeoutMs in settings.';
  }

  if (lower.includes('no api key set')) {
    return 'API key is missing for the selected provider. Run "ImageGen: Set API Key".';
  }

  if (lower.includes('401') || lower.includes('unauthorized')) {
    return 'Authentication failed. Check your API key for the selected provider.';
  }

  if (lower.includes('403') || lower.includes('forbidden')) {
    return 'Access denied by provider. Verify API key permissions and account access.';
  }

  if (lower.includes('429') || lower.includes('rate limit')) {
    return 'Provider rate limit reached. Wait a moment and try again.';
  }

  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('504')
  ) {
    return 'Provider is temporarily unavailable. Please retry in a moment.';
  }

  if (lower.includes('wasm encoder has not been initialized')) {
    return 'Image encoder is not ready yet. Reload the VS Code window and try again.';
  }

  if (lower.includes('no workspace folder is open')) {
    return 'Open a workspace folder before generating images.';
  }

  if (lower.includes('relative input image paths require an open workspace')) {
    return 'For edit mode without a workspace, use an absolute file path, URL, or data URL.';
  }

  if (lower.includes('unsupported image type')) {
    return 'Provider returned an unsupported image format.';
  }

  return raw || 'Unexpected error occurred while generating image.';
}
