import type { Platform } from './messenger.js'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { config } from './config.js'
import { PLATFORMS } from './messenger.js'

/**
 * The chats the count is posted in, per messenger — a chat id only means
 * something on the messenger it came from. A handful of ids, so a JSON file is
 * all the storage it needs, written whole to a temp file and renamed over the
 * old one so a crash mid-write never leaves it half written.
 */

type Store = Record<Platform, Set<number>>

function load(): Store {
  let raw: Partial<Record<Platform, unknown>> = {}
  try {
    raw = JSON.parse(readFileSync(config.chatsPath, 'utf8'))
  }
  catch {}
  return Object.fromEntries(PLATFORMS.map((platform) => {
    const ids = raw[platform]
    return [
      platform,
      new Set(Array.isArray(ids)
        ? ids.filter((id): id is number => typeof id === 'number')
        : []),
    ]
  })) as Store
}

const chats = load()

function save(): void {
  mkdirSync(dirname(config.chatsPath), { recursive: true })
  const data = Object.fromEntries(PLATFORMS.map(platform => [
    platform,
    [...chats[platform]],
  ]))
  const tmp = `${config.chatsPath}.tmp`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(tmp, config.chatsPath)
}

/** Adds a chat; returns false when it was already there. */
export function addChat(platform: Platform, id: number): boolean {
  if (chats[platform].has(id))
    return false
  chats[platform].add(id)
  save()
  return true
}

/** Removes a chat; returns false when it was not there. */
export function removeChat(platform: Platform, id: number): boolean {
  if (!chats[platform].delete(id))
    return false
  save()
  return true
}

export function listChats(platform: Platform): number[] {
  return [...chats[platform]]
}
