import { afterEach, describe, expect, it } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  credentialsFilePath,
  readCredentialsFile,
  refreshExportedCredential,
  resolveApiKey,
  writeCredentialsFile,
} from './credentials';

const temporaryRoots: string[] = [];

function useTemporaryCredentialsFile(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imagegen-credentials-'));
  temporaryRoots.push(root);
  const filePath = path.join(root, 'credentials.json');
  process.env.IMAGEGEN_CREDENTIALS_FILE = filePath;
  return filePath;
}

afterEach(() => {
  delete process.env.IMAGEGEN_CREDENTIALS_FILE;
  delete process.env.GEMINI_API_KEY;
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('credentials file', () => {
  it('round-trips stored keys', () => {
    const filePath = useTemporaryCredentialsFile();
    expect(writeCredentialsFile({ 'gemini-api-key': 'abc123' })).toBe(filePath);
    expect(readCredentialsFile()).toEqual({ 'gemini-api-key': 'abc123' });
  });

  it('trims values and drops blank ones', () => {
    useTemporaryCredentialsFile();
    writeCredentialsFile({ 'gemini-api-key': '  abc123  ', 'openai-api-key': '   ' });
    expect(readCredentialsFile()).toEqual({ 'gemini-api-key': 'abc123' });
  });

  it('ignores unknown keys in the file', () => {
    const filePath = useTemporaryCredentialsFile();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{"gemini-api-key": "abc", "something-else": "x"}', 'utf8');
    expect(readCredentialsFile()).toEqual({ 'gemini-api-key': 'abc' });
  });

  it('returns nothing when the file does not exist', () => {
    process.env.IMAGEGEN_CREDENTIALS_FILE = path.join(os.tmpdir(), 'imagegen-missing', 'credentials.json');
    expect(readCredentialsFile()).toEqual({});
  });

  it('reports a malformed file instead of failing silently', () => {
    const filePath = useTemporaryCredentialsFile();
    fs.writeFileSync(filePath, 'not json', 'utf8');
    expect(() => readCredentialsFile()).toThrow(/not valid JSON/i);
  });

  it('honours an explicit file path override', () => {
    const filePath = useTemporaryCredentialsFile();
    expect(credentialsFilePath()).toBe(filePath);
  });
});

describe('resolveApiKey', () => {
  it('prefers the environment over the file', () => {
    process.env.GEMINI_API_KEY = 'from-env';
    expect(resolveApiKey('gemini-api-key', { 'gemini-api-key': 'from-file' })).toBe('from-env');
  });

  it('falls back to the file when the environment variable is blank', () => {
    process.env.GEMINI_API_KEY = '   ';
    expect(resolveApiKey('gemini-api-key', { 'gemini-api-key': 'from-file' })).toBe('from-file');
  });

  it('returns undefined when neither source has the key', () => {
    expect(resolveApiKey('openai-api-key', {})).toBeUndefined();
  });
});

describe('refreshExportedCredential', () => {
  it('updates a key that was exported before', () => {
    useTemporaryCredentialsFile();
    writeCredentialsFile({ 'gemini-api-key': 'old' });
    expect(refreshExportedCredential('gemini-api-key', 'new')).toBe(true);
    expect(readCredentialsFile()).toEqual({ 'gemini-api-key': 'new' });
  });

  it('leaves other exported keys untouched', () => {
    useTemporaryCredentialsFile();
    writeCredentialsFile({ 'gemini-api-key': 'old', 'openai-api-key': 'keep' });
    refreshExportedCredential('gemini-api-key', 'new');
    expect(readCredentialsFile()).toEqual({ 'gemini-api-key': 'new', 'openai-api-key': 'keep' });
  });

  it('does not export a key that was never exported', () => {
    useTemporaryCredentialsFile();
    writeCredentialsFile({ 'gemini-api-key': 'old' });
    expect(refreshExportedCredential('openai-api-key', 'new')).toBe(false);
    expect(readCredentialsFile()).toEqual({ 'gemini-api-key': 'old' });
  });

  it('does not create the file when no export exists', () => {
    const filePath = useTemporaryCredentialsFile();
    expect(refreshExportedCredential('gemini-api-key', 'new')).toBe(false);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
