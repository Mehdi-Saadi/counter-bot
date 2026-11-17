# counter-bot

A bot for Telegram and Bale that posts the days left until a date to its groups every morning, for example `94 روز مانده`, and nothing else.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in the token(s) and TARGET_DATE
pnpm start
```

- `TELEGRAM_BOT_TOKEN` / `BALE_BOT_TOKEN`: one or both. The bot runs on each messenger it has a token for.
- `TARGET_DATE`: Jalali (`1405-01-01`) or Gregorian (`2026-03-21`). A year before 1700 is read as Jalali.
- `SEND_TIME` / `TIMEZONE`: `08:00` and `Asia/Tehran` by default.

## Usage

1. Add the bot to a group. On Telegram the group is registered automatically and gets today's count right away.
2. On Bale, or if it wasn't registered, send `/start` in the group.
3. From then on, the count is posted every day at `SEND_TIME`.
4. `/stop` in a group stops the posts there. Removing the bot from the group does the same.

Groups are kept in `data/chats.json`. Once the date arrives, the bot stops posting.

In production, run with `NODE_ENV=production` under pm2 (`pm2 start pnpm --name counter-bot -- start`). The bot exits if its runner stops, so pm2 can restart it.
