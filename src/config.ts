import process from 'node:process'
import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'
import { isValidTimeZone, parseDate } from './days.js'
import { fromRoot } from './paths.js'

loadDotenv({
  path: fromRoot('.env'),
  quiet: true,
})

const envSchema = z.object({
  // The bot runs on every messenger it has a token for, side by side: either
  // may be left empty, as long as one is set.
  // Telegram — from @BotFather
  TELEGRAM_BOT_TOKEN: z.string().default(''),
  // Bale — from @botfather in Bale
  BALE_BOT_TOKEN: z.string().default(''),
  // The day being counted down to: 1405-01-01 (Jalali) or 2026-03-21 (Gregorian).
  TARGET_DATE: z.string().transform((value, ctx) => {
    const date = parseDate(value)
    if (!date) {
      ctx.addIssue({ code: 'custom', message: `Not a date: "${value}" — write it as 1405-01-01 or 2026-03-21` })
      return z.NEVER
    }
    return date
  }),
  // When the count is posted each day, in TIMEZONE.
  SEND_TIME: z.string().default('08:00').transform((value, ctx) => {
    const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
    if (!match) {
      ctx.addIssue({ code: 'custom', message: `Not a time: "${value}" — write it as 08:00` })
      return z.NEVER
    }
    return {
      hour: Number(match[1]),
      minute: Number(match[2]),
    }
  }),
  TIMEZONE: z.string().default('Asia/Tehran').refine(isValidTimeZone, { message: 'Unknown time zone' }),
  LOG_LEVEL: z.enum([
    'trace',
    'debug',
    'info',
    'warn',
    'error',
  ]).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
})

const parsed = envSchema
  .refine(env => env.TELEGRAM_BOT_TOKEN || env.BALE_BOT_TOKEN, {
    message: 'Set TELEGRAM_BOT_TOKEN, BALE_BOT_TOKEN, or both',
    path: ['TELEGRAM_BOT_TOKEN'],
  })
  .safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(z.flattenError(parsed.error).fieldErrors)
  process.exit(1)
}

const env = parsed.data

export const config = {
  telegram: { botToken: env.TELEGRAM_BOT_TOKEN },
  bale: { botToken: env.BALE_BOT_TOKEN },
  targetDate: env.TARGET_DATE,
  sendTime: env.SEND_TIME,
  timeZone: env.TIMEZONE,
  // The groups the bot posts in, remembered as it is added to and removed from them.
  chatsPath: fromRoot('./data/chats.json'),
  logLevel: env.LOG_LEVEL,
  isDev: env.NODE_ENV !== 'production',
} as const
