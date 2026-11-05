export type Tone = 'ok' | 'busy' | 'warn' | 'fail' | 'idle'

const ANSI: Record<Tone, string> = { ok: '32', busy: '94', warn: '33', fail: '31', idle: '90' }
const SUMMARY_DOT: Record<Tone, string> = { ok: '🟢', busy: '🔵', warn: '🟡', fail: '🔴', idle: '⚪' }

const paint =
  (code: string) =>
  (text: string): string =>
    `\u001b[${code}m${text}\u001b[0m`

export const bold = paint('1')
export const dim = paint('2')
export const green = paint('32')
export const cyan = paint('36')

// Covers both Environment.Status and LastUpdate.Status values.
export function toneOf(status: string | undefined): Tone {
  switch (status) {
    case 'AVAILABLE':
    case 'SUCCESS':
      return 'ok'
    case 'ROLLING_BACK':
    case 'MAINTENANCE':
      return 'warn'
    case 'FAILED':
    case 'UPDATE_FAILED':
    case 'CREATE_FAILED':
    case 'UNAVAILABLE':
    case 'DELETED':
      return 'fail'
    case undefined:
    case '':
      return 'idle'
    default:
      return 'busy'
  }
}

// A colored "● STATUS" for the step log.
export function logStatus(status: string | undefined, tone: Tone = toneOf(status)): string {
  return paint(ANSI[tone])(`● ${status || 'unknown'}`)
}

// The job summary renders markdown and ignores ANSI codes, so it uses colored emoji.
export const summaryDot = (tone: Tone): string => SUMMARY_DOT[tone]

export function summaryStatus(status: string | undefined): string {
  return status ? `${summaryDot(toneOf(status))} ${status}` : summaryDot('idle')
}

export function pollLine(
  status: string | undefined,
  updateStatus: string | undefined,
  elapsedSeconds: number,
  isOurs: boolean
): string {
  return isOurs
    ? `${logStatus(status)} ${dim(`(update: ${updateStatus ?? 'n/a'}, ${elapsedSeconds}s)`)}`
    : `${logStatus(status, 'idle')} ${dim(`(waiting for MWAA to start the update, ${elapsedSeconds}s)`)}`
}

// Renders a request value the way it would appear in YAML: strings and numbers as-is, objects as JSON.
export const formatValue = (value: unknown): string =>
  typeof value === 'object' ? JSON.stringify(value) : String(value)
