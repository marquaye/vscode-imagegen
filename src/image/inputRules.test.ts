import { describe, expect, it } from 'bun:test';
import { assertInputImageSize, inferMimeTypeFromPathname } from './inputRules';

describe('inferMimeTypeFromPathname', () => {
  it('infers jpeg and png correctly', () => {
    expect(inferMimeTypeFromPathname('x/test.jpg')).toBe('image/jpeg');
    expect(inferMimeTypeFromPathname('x/test.png')).toBe('image/png');
  });

  it('defaults unknown extension to png', () => {
    expect(inferMimeTypeFromPathname('x/test.bin')).toBe('image/png');
  });
});

describe('assertInputImageSize', () => {
  it('throws when size exceeds max', () => {
    expect(() => assertInputImageSize(11, 10)).toThrow(/too large/i);
  });

  it('does not throw when size is within max', () => {
    expect(() => assertInputImageSize(10, 10)).not.toThrow();
  });
});
