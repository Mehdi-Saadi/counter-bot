/**
 * Dates here are plain calendar days, kept as `YYYY-MM-DD` strings in the
 * Gregorian calendar, so "days left" is a difference of two days and never
 * depends on the hour or on where the server happens to be.
 */

const DAY_MS = 24 * 60 * 60 * 1000

// Persian (۰-۹) and Arabic (٠-٩) digits, so a date typed on a Persian keyboard still reads.
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function toLatinDigits(text: string): string {
  return [...text].map((char) => {
    const digit = Math.max(PERSIAN_DIGITS.indexOf(char), ARABIC_DIGITS.indexOf(char))
    return digit === -1
      ? char
      : String(digit)
  }).join('')
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isoDay(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

const persianParts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

/**
 * The Gregorian day a Jalali (solar hijri) date falls on. The year starts in
 * March of `year + 621`, so the day is found by walking from there and asking
 * the platform's own Persian calendar which Jalali day each one is.
 */
function jalaliToGregorian(year: number, month: number, day: number): string | null {
  const start = Date.UTC(year + 621, 2, 1)
  for (let i = 0; i < 400; i++) {
    const date = new Date(start + i * DAY_MS)
    const parts = Object.fromEntries(persianParts.formatToParts(date).map(p => [p.type, p.value]))
    if (Number(parts.year) === year && Number(parts.month) === month && Number(parts.day) === day)
      return date.toISOString().slice(0, 10)
  }
  return null
}

/**
 * Reads `YYYY-MM-DD` (or with `/`). A year before 1700 is taken as Jalali
 * (e.g. 1405-01-01), anything later as Gregorian (e.g. 2026-03-21).
 * Returns the Gregorian `YYYY-MM-DD`, or null when it is not a real date.
 */
export function parseDate(input: string): string | null {
  const match = toLatinDigits(input.trim()).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!match)
    return null
  const [year, month, day] = match.slice(1).map(Number) as [number, number, number]

  if (year < 1700)
    return jalaliToGregorian(year, month, day)

  const date = new Date(Date.UTC(year, month - 1, day))
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return valid
    ? isoDay(year, month, day)
    : null
}

/** Today's date in the given time zone, as `YYYY-MM-DD`. */
export function today(timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`: tomorrow is 1, today is 0. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/** Whether `timeZone` is one the platform knows. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format()
    return true
  }
  catch {
    return false
  }
}
