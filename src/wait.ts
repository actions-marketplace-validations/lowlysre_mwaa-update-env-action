import type { Environment } from '@aws-sdk/client-mwaa'

export interface WaitOptions {
  fetch: () => Promise<Environment>
  // LastUpdate.CreatedAt (epoch ms) from before this run submitted its update.
  previousUpdateAt: number | undefined
  pollIntervalSeconds: number
  timeoutSeconds: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  // isOurs is false while GetEnvironment still reports the update from before this run.
  onPoll?: (env: Environment, elapsedSeconds: number, isOurs: boolean) => void
}

// Carries the last environment seen, so callers can report it without another API call.
export class WaitError extends Error {
  readonly environment: Environment

  constructor(message: string, environment: Environment) {
    super(message)
    this.name = new.target.name
    this.environment = environment
  }
}
export class UpdateFailedError extends WaitError {}
export class WaitTimeoutError extends WaitError {}

const FAILED_STATUSES = new Set(['UPDATE_FAILED', 'UNAVAILABLE', 'CREATE_FAILED', 'DELETING', 'DELETED'])

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function describeError(env: Environment): string {
  const { ErrorCode, ErrorMessage } = env.LastUpdate?.Error ?? {}
  return [ErrorCode, ErrorMessage].filter(Boolean).join(': ') || 'no error details were returned'
}

// Resolves once this run's update has succeeded and the environment is AVAILABLE again.
export async function waitForUpdate(options: WaitOptions): Promise<Environment> {
  const { fetch, previousUpdateAt, pollIntervalSeconds, timeoutSeconds, onPoll } = options
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const start = now()

  for (;;) {
    const env = await fetch()
    const elapsed = Math.round((now() - start) / 1000)
    const update = env.LastUpdate
    const isOurs = update?.CreatedAt?.getTime() !== previousUpdateAt
    onPoll?.(env, elapsed, isOurs)

    if (FAILED_STATUSES.has(env.Status ?? '')) {
      throw new UpdateFailedError(`Environment entered ${env.Status}: ${describeError(env)}`, env)
    }
    if (isOurs && update?.Status === 'FAILED') {
      throw new UpdateFailedError(`Environment update failed: ${describeError(env)}`, env)
    }
    if (isOurs && env.Status === 'AVAILABLE' && update?.Status === 'SUCCESS') return env

    if (elapsed + pollIntervalSeconds > timeoutSeconds) {
      throw new WaitTimeoutError(
        `Timed out after ${elapsed}s waiting for the environment to become AVAILABLE (status: ${env.Status ?? 'unknown'}).`,
        env
      )
    }
    await sleep(pollIntervalSeconds * 1000)
  }
}
