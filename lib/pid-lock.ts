/**
 * PID-based single-instance lock for process management.
 *
 * Usage:
 *   const { acquireLock, releaseLock, isLocked, readPid } = require('./pid-lock');
 *
 *   // Acquire lock (throws if another instance is running)
 *   acquireLock('/path/to/lock.pid');
 *
 *   // Release lock on shutdown
 *   releaseLock('/path/to/lock.pid');
 *
 *   // Check if a process holds the lock
 *   const running = isLocked('/path/to/lock.pid');
 */

import * as fs from 'fs';

export interface LockError extends Error {
  code?: string;
  pid?: number;
}

export interface AcquireLockOptions {
  pid?: number;
  onStale?: (stalePid: number) => void;
}

/**
 * Check whether a process with the given PID is currently running.
 * @param pid
 * @returns
 */
export function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the PID stored in a lock file.
 * Returns null if the file does not exist or the content is not a positive integer.
 * @param pidFile
 * @returns
 */
export function readPid(pidFile: string): number | null {
  try {
    if (!fs.existsSync(pidFile)) return null;
    const raw = fs.readFileSync(pidFile, 'utf8').trim();
    const pid = parseInt(raw, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

/**
 * Try to acquire a single-instance lock.
 *
 * Behaviour:
 *  - If the lock file does not exist → create it and write current PID.
 *  - If the lock file exists but the stored PID is invalid → remove and recreate.
 *  - If the lock file exists and the stored PID is the current process → no-op.
 *  - If the lock file exists and the stored PID belongs to a running process → throw Error.
 *  - If the lock file exists but the process is dead (stale) → remove and recreate.
 *
 * @param pidFile  Absolute path to the PID lock file.
 * @param options
 * @throws {Error} If another instance is already running.
 */
export function acquireLock(pidFile: string, options: AcquireLockOptions = {}): void {
  const pid = options.pid || process.pid;
  const onStale = options.onStale || (() => {});

  // Ensure parent directory exists
  const dir = pidFile.substring(0, pidFile.lastIndexOf('/'));
  if (dir && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let fd: number;
  try {
    // Atomic create-and-write via O_EXCL (wx flags)
    fd = fs.openSync(pidFile, 'wx');
    fs.writeSync(fd, pid.toString());
    fs.closeSync(fd);
    return;
  } catch (e) {
    // File already exists – fall through to inspect it
  }

  // Lock file exists – read and inspect
  const existingPid = readPid(pidFile);

  if (existingPid === null) {
    // Invalid / corrupt PID file – remove and retry
    fs.unlinkSync(pidFile);
    fd = fs.openSync(pidFile, 'wx');
    fs.writeSync(fd, pid.toString());
    fs.closeSync(fd);
    return;
  }

  if (existingPid === pid) {
    // Same process already holds the lock
    return;
  }

  if (isProcessRunning(existingPid)) {
    // Another instance is alive
    const err = new Error(
      `Another instance is already running (PID: ${existingPid})`
    ) as LockError;
    err.code = 'ELOCKED';
    err.pid = existingPid;
    throw err;
  }

  // Stale – old process is dead
  onStale(existingPid);
  fs.unlinkSync(pidFile);
  fd = fs.openSync(pidFile, 'wx');
  fs.writeSync(fd, pid.toString());
  fs.closeSync(fd);
}

/**
 * Release a previously acquired lock by removing the PID file.
 * No-op if the file does not exist.
 * @param pidFile
 */
export function releaseLock(pidFile: string): void {
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // File may not exist – ignore
  }
}

/**
 * Check whether a process currently holds the lock.
 * @param pidFile
 * @returns true if the lock is held by a live process.
 */
export function isLocked(pidFile: string): boolean {
  const pid = readPid(pidFile);
  if (pid === null) return false;
  return isProcessRunning(pid);
}

export default {
  acquireLock,
  releaseLock,
  isLocked,
  readPid,
  isProcessRunning
};