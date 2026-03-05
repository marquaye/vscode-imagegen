import * as path from 'path';

export function assertInputImageSize(bytes: number, maxBytes: number): void {
  if (bytes > maxBytes) {
    const maxMb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    throw new Error(`ImageGen: Input image is too large. Max supported size is ${maxMb} MB.`);
  }
}

export function inferMimeTypeFromPathname(imagePath: string): string {
  const extension = path.extname(imagePath).toLowerCase();
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  if (extension === '.gif') {
    return 'image/gif';
  }
  return 'image/png';
}
