import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The project root, found from this file rather than from `process.cwd()`, so
 * .env and data/ are found wherever the bot is started from.
 */
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Resolves a root-relative path; absolute paths are returned untouched. */
export function fromRoot(path: string): string {
  return resolve(root, path)
}
