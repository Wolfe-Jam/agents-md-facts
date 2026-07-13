import { existsSync } from 'fs';
import { join } from 'path';

/** A detected secrets file: its location, plus an example template if one exists. */
export interface DetectedSecrets {
  secrets: string;
  example?: string;
}

/**
 * Detect a secrets file (a `.env` variant) at the repo root — LOCATION ONLY,
 * never the values. Returns null when none is present. Pure.
 */
export function detectSecrets(dir: string): DetectedSecrets | null {
  const envFiles = ['.env', '.env.local', '.env.development'];
  const secrets = envFiles.find((f) => existsSync(join(dir, f)));
  if (!secrets) return null;

  const example = ['.env.example', '.env.sample', '.env.template'].find((f) =>
    existsSync(join(dir, f)),
  );
  return { secrets, ...(example ? { example } : {}) };
}
