import { readFile, unlink, writeFile } from 'node:fs/promises';
import { unlinkSync } from 'node:fs';

/**
 * Keeps two processes from opening the same embedded database folder: it holds one writer only, and a
 * second one would silently lose writes (found with the "reset link" command run beside a live server).
 * The lock is a file next to the folder holding the process id; one left by a process that no longer
 * exists is ignored. Returns the function that gives the lock back.
 */
export async function acquireDirectoryLock(lockPath: string): Promise<() => Promise<void>> {
  try {
    await writeFile(lockPath, String(process.pid), { flag: 'wx' });
  } catch (error) {
    if (!isFileExistsError(error)) throw error;
    const owner = Number((await readFile(lockPath, 'utf8').catch(() => '')).trim());
    if (Number.isInteger(owner) && owner > 0 && owner !== process.pid && isProcessAlive(owner)) {
      throw new Error(
        `Another process (pid ${owner}) is already using this data folder. ` +
          'Stop it first (for example the development server) before opening the database again.',
      );
    }
    await writeFile(lockPath, String(process.pid)); // stale lock: take it over
  }

  const releaseOnExit = () => {
    try {
      unlinkSync(lockPath);
    } catch {
      // already gone
    }
  };
  process.once('exit', releaseOnExit);
  return async () => {
    process.off('exit', releaseOnExit);
    await unlink(lockPath).catch(() => undefined);
  };
}

function isFileExistsError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 only checks that the process exists
    return true;
  } catch (error) {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EPERM'; // exists, but is not ours
  }
}
