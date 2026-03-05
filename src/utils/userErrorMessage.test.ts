import { describe, expect, it } from 'bun:test';
import { toUserErrorMessage } from './userErrorMessage';

describe('toUserErrorMessage', () => {
  it('maps timeout errors', () => {
    expect(toUserErrorMessage(new Error('Request timed out after 45000ms.')))
      .toContain('Request timed out');
  });

  it('maps auth errors', () => {
    expect(toUserErrorMessage(new Error('OpenAI API error 401: unauthorized')))
      .toContain('Authentication failed');
  });

  it('maps cancellation errors', () => {
    expect(toUserErrorMessage(new Error('Request cancelled.'))).toBe('Request cancelled.');
  });

  it('returns original message when no mapping matches', () => {
    expect(toUserErrorMessage(new Error('Something custom happened')))
      .toBe('Something custom happened');
  });
});
