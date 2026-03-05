import { describe, expect, it } from 'bun:test';
import { aspectRatioToOpenAISize } from './types';

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
