import { config } from './config.js'

export const PLATFORMS = ['telegram', 'bale'] as const
export type Platform = typeof PLATFORMS[number]

interface MessengerInfo {
  /** For logs. */
  name: string
  /**
   * The Bot API server. Bale's is Telegram's API with a few things missing, so
   * the same client (grammY) talks to both — only the address differs.
   */
  apiRoot: string
  /** Empty when the bot is not set up on this messenger. */
  token: string
}

export const MESSENGERS: Record<Platform, MessengerInfo> = {
  telegram: { name: 'Telegram', apiRoot: 'https://api.telegram.org', token: config.telegram.botToken },
  bale: { name: 'Bale', apiRoot: 'https://tapi.bale.ai', token: config.bale.botToken },
}

/** The messengers the bot runs on — the ones it has a token for. */
export function enabledPlatforms(): Platform[] {
  return PLATFORMS.filter(platform => MESSENGERS[platform].token)
}
