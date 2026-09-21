import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { API_KEY_NAMES, type ApiKeyName } from '../providers/types';

/**
 * Credentials shared between the VS Code extension and the stdio MCP server.
 *
 * The extension keeps API keys in SecretStorage, which an external agent
 * process cannot read. Instead of forcing users to paste keys into an
 * `.mcp.json` file that may end up in version control, the extension exports
 * them once into a file under the user's home directory and the MCP server
 * reads them back from there.
 */

export type StoredCredentials = Partial<Record<ApiKeyName, string>>;

/** Environment variable name an agent can use instead of the credentials file. */
export const API_KEY_ENV_NAMES: Record<ApiKeyName, string> = {
  'gemini-api-key': 'GEMINI_API_KEY',
  'openai-api-key': 'OPENAI_API_KEY',
  'openrouter-api-key': 'OPENROUTER_API_KEY',
};

export function credentialsDirectory(): string {
  return path.join(os.homedir(), '.imagegen');
}

/** Location of the exported credentials file; overridable for tests and custom setups. */
export function credentialsFilePath(): string {
  return process.env.IMAGEGEN_CREDENTIALS_FILE ?? path.join(credentialsDirectory(), 'credentials.json');
}

export function readCredentialsFile(): StoredCredentials {
  const filePath = credentialsFilePath();
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error(`ImageGen: Credentials file at ${filePath} is not valid JSON.`);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return {};
  }

  const record = parsed as Record<string, unknown>;
  const credentials: StoredCredentials = {};
  for (const keyName of API_KEY_NAMES) {
    const value = record[keyName];
    if (typeof value === 'string' && value.trim().length > 0) {
      credentials[keyName] = value.trim();
    }
  }
  return credentials;
}

/**
 * Writes the credentials file with owner-only permissions.
 *
 * The POSIX mode is ignored on Windows, where the file inherits the ACL of the
 * user profile directory — still private to the signed-in user, but not
 * enforced by a file mode.
 */
export function writeCredentialsFile(credentials: StoredCredentials): string {
  const filePath = credentialsFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });

  const payload: StoredCredentials = {};
  for (const keyName of API_KEY_NAMES) {
    const value = credentials[keyName];
    if (typeof value === 'string' && value.trim().length > 0) {
      payload[keyName] = value.trim();
    }
  }

  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort — chmod is a no-op on Windows.
  }
  return filePath;
}

/** Resolves an API key from the environment first, then the exported file. */
export function resolveApiKey(keyName: ApiKeyName, fileCredentials: StoredCredentials): string | undefined {
  const fromEnv = process.env[API_KEY_ENV_NAMES[keyName]];
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return fileCredentials[keyName];
}

/**
 * Keeps a previously exported key in sync after the user rotates it in VS Code.
 *
 * Only an already exported key is rewritten: a user who never connected an
 * external agent should not silently get a credentials file on disk.
 * Returns whether the file was updated.
 */
export function refreshExportedCredential(keyName: ApiKeyName, value: string): boolean {
  const filePath = credentialsFilePath();
  if (!fs.existsSync(filePath)) {
    return false;
  }

  let existing: StoredCredentials;
  try {
    existing = readCredentialsFile();
  } catch {
    return false;
  }
  if (existing[keyName] === undefined || existing[keyName] === value.trim()) {
    return false;
  }

  writeCredentialsFile({ ...existing, [keyName]: value });
  return true;
}
