export type Tone = 'ok' | 'busy' | 'warn' | 'fail' | 'idle'

const ANSI: Record<Tone, string> = { ok: '32', busy: '94', warn: '33', fail: '31', idle: '90' }
const SUMMARY_DOT: Record<Tone, string> = { ok: '🟢', busy: '🔵', warn: '🟡', fail: '🔴', idle: '⚪' }

export const paint = (code: string, text: string): string => `\u001b[${code}m${text}\u001b[0m`
export const dim = (text: string): string => paint('2', text)

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
  return paint(ANSI[tone], `● ${status ?? 'unknown'}`)
}

// A "🟢 STATUS" for the job summary, which renders markdown and ignores ANSI codes.
export function summaryStatus(status: string | undefined, tone: Tone = toneOf(status)): string {
  return `${SUMMARY_DOT[tone]} ${status ?? ''}`.trimEnd()
}

export function pollLine(
  status: string | undefined,
  updateStatus: string | undefined,
  elapsedSeconds: number,
  isOurs: boolean
): string {
  if (!isOurs)
    return `${logStatus(status, 'idle')} ${dim(`(waiting for MWAA to start the update, ${elapsedSeconds}s)`)}`
  return `${logStatus(status)} ${dim(`(update: ${updateStatus ?? 'n/a'}, ${elapsedSeconds}s)`)}`
}
