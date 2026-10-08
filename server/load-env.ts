import { existsSync } from 'node:fs';

/**
 * Loads `.env` from the working directory when it exists. Real environment variables win over the
 * file. Done here rather than with a Node command-line flag because watch mode crashes when the
 * flag points at a missing file.
 */
export function loadEnvFile(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
