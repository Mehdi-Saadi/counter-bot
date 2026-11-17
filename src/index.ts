import type { RunnerHandle } from '@grammyjs/runner'
import type { Platform } from './messenger.js'
import process from 'node:process'
import { run } from '@grammyjs/runner'
import { Cron } from 'croner'
import { Bot, GrammyError } from 'grammy'
import { addChat, listChats, removeChat } from './chats.js'
import { config } from './config.js'
import { daysBetween, today } from './days.js'
import { logger } from './logger.js'
import { enabledPlatforms, MESSENGERS } from './messenger.js'

const MESSENGER_RETRY_MS = 60_000
const MESSENGER_INIT_TIMEOUT_MS = 30_000

/** What is posted today, or null once the day has come and there is nothing left to count. */
function countdownText(): string | null {
  const days = daysBetween(today(config.timeZone), config.targetDate)
  return days > 0
    ? `${days} روز مانده`
    : null
}

function createBot(platform: Platform): Bot {
  const { token, apiRoot } = MESSENGERS[platform]
  const bot = new Bot(token, {
    client: { apiRoot },
  })

  // Added to a group or removed from it. Telegram always sends this; on Bale,
  // where it may not arrive, /start in the group does the same.
  bot.on('my_chat_member', async (ctx) => {
    const { chat } = ctx
    if (chat.type === 'private')
      return
    const status = ctx.myChatMember.new_chat_member.status
    if (status === 'member' || status === 'administrator') {
      if (addChat(platform, chat.id)) {
        logger.info({ platform, chatId: chat.id }, 'Added to a chat')
        const text = countdownText()
        if (text)
          await ctx.api.sendMessage(chat.id, text).catch(err => logger.warn({ err, platform, chatId: chat.id }, 'Could not post in the new chat'))
      }
    }
    else if (removeChat(platform, chat.id)) {
      logger.info({ platform, chatId: chat.id }, 'Removed from a chat')
    }
  })

  bot.command('start', async (ctx) => {
    const text = countdownText() ?? 'روزی که شمرده می‌شد رسید.'
    if (ctx.chat.type === 'private')
      return ctx.reply(`${text}\n\nمن را به یک گروه اضافه کنید تا هر روز ساعت ${formatTime()} همین را آنجا بفرستم.`)
    if (addChat(platform, ctx.chat.id))
      logger.info({ platform, chatId: ctx.chat.id }, 'Chat registered with /start')
    await ctx.reply(text)
  })

  bot.command('stop', async (ctx) => {
    if (ctx.chat.type === 'private')
      return
    if (removeChat(platform, ctx.chat.id))
      logger.info({ platform, chatId: ctx.chat.id }, 'Chat unregistered with /stop')
    await ctx.reply('دیگر در این گروه چیزی نمی‌فرستم. با /start دوباره روشن می‌شود.')
  })

  // A Telegram group upgraded to a supergroup gets a new id; the old one stops working.
  bot.on('message:migrate_to_chat_id', (ctx) => {
    const newId = ctx.message.migrate_to_chat_id
    if (removeChat(platform, ctx.chat.id))
      addChat(platform, newId)
  })

  bot.catch(({ error, ctx }) => {
    logger.error({ err: error, platform, updateId: ctx.update.update_id }, 'Error while handling an update')
  })

  return bot
}

function formatTime(): string {
  const { hour, minute } = config.sendTime
  return `${hour}:${String(minute).padStart(2, '0')}`
}

/** Posts today's count in every chat, on every messenger. */
async function postCountdown(bots: { platform: Platform, bot: Bot }[]): Promise<void> {
  const text = countdownText()
  if (!text) {
    logger.info({ targetDate: config.targetDate }, 'The target date has come, nothing to post')
    return
  }

  for (const { platform, bot } of bots) {
    for (const chatId of listChats(platform)) {
      try {
        await bot.api.sendMessage(chatId, text)
      }
      catch (err) {
        const migratedTo = err instanceof GrammyError
          ? err.parameters.migrate_to_chat_id
          : undefined
        if (migratedTo !== undefined) {
          removeChat(platform, chatId)
          addChat(platform, migratedTo)
          await bot.api.sendMessage(migratedTo, text).catch(err => logger.warn({ err, platform, chatId: migratedTo }, 'Could not post'))
        }
        // Kicked, or the group is gone: nothing will ever get through again.
        else if (err instanceof GrammyError && err.error_code === 403) {
          removeChat(platform, chatId)
          logger.info({ platform, chatId, reason: err.description }, 'No longer allowed in the chat, forgot it')
        }
        else {
          logger.warn({ err, platform, chatId }, 'Could not post')
        }
      }
    }
  }
  logger.info({ text }, 'Countdown posted')
}

function main(): void {
  const platforms = enabledPlatforms()
  logger.info({
    targetDate: config.targetDate,
    sendAt: formatTime(),
    timeZone: config.timeZone,
    messengers: platforms,
    today: countdownText(),
  }, 'Starting counter bot...')

  const bots = platforms.map(platform => ({
    platform,
    bot: createBot(platform),
  }))
  const runners: RunnerHandle[] = []
  let shuttingDown = false

  // Each messenger comes up on its own time: one that cannot be reached right
  // now (Telegram is filtered in Iran, Bale may refuse foreign servers) must
  // not keep the other down with it, so it is retried until it answers.
  for (const { platform, bot } of bots) {
    const name = MESSENGERS[platform].name
    let failures = 0
    const start = (): void => {
      bot.init(AbortSignal.timeout(MESSENGER_INIT_TIMEOUT_MS) as Parameters<typeof bot.init>[0]).then(() => {
        if (shuttingDown)
          return
        const runner = run(bot, {
          runner: {
            fetch: {
              allowed_updates: ['message', 'my_chat_member'],
            },
          },
        })
        runners.push(runner)
        // Stopping on its own means something is badly wrong: exit so the
        // process manager (pm2) restarts it clean.
        runner.task()?.then(() => {
          if (!shuttingDown)
            throw new Error('Runner stopped unexpectedly')
        }).catch((err) => {
          if (shuttingDown)
            return
          logger.fatal({ err, platform }, 'Bot stopped')
          process.exit(1)
        })
        logger.info({ username: bot.botInfo.username, messenger: name }, 'Bot started')
      }).catch((err) => {
        if (failures++ === 0) {
          logger.error({ err, platform }, 'Could not start the bot on this messenger, retrying every minute')
        }
        else {
          logger.warn({
            platform,
            attempt: failures,
            reason: err instanceof Error
              ? err.message
              : String(err),
          }, 'Messenger still unreachable, retrying')
        }
        if (!shuttingDown)
          setTimeout(start, MESSENGER_RETRY_MS)
      })
    }
    start()
  }

  const { hour, minute } = config.sendTime
  const job = new Cron(`${minute} ${hour} * * *`, { timezone: config.timeZone, protect: true }, () => postCountdown(bots))
  logger.info({
    nextRun: job.nextRun()?.toISOString(),
  }, 'Daily post scheduled')

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown)
      return
    shuttingDown = true
    logger.info({ signal }, 'Shutting down')
    job.stop()
    await Promise.all(runners.filter(runner => runner.isRunning()).map(runner => runner.stop()))
    process.exit(0)
  }
  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
}

main()
