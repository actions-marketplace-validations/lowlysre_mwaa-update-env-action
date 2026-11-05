import type { Environment } from '@aws-sdk/client-mwaa'

export type FetchEnvironment = () => Promise<Environment>

export interface WaitOptions {
  fetch: FetchEnvironment
  // LastUpdate.CreatedAt (epoch ms) of the environment before our update was submitted.
  previousUpdateAt: number | undefined
  pollIntervalSeconds: number
  timeoutSeconds: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  // isOurs is false while GetEnvironment still reports the update from before this run.
  onPoll?: (env: Environment, elapsedSeconds: number, isOurs: boolean) => void
}

export class UpdateFailedError extends Error {}
export class WaitTimeoutError extends Error {}

const FAILED_STATUSES = new Set(['UPDATE_FAILED', 'UNAVAILABLE', 'CREATE_FAILED', 'DELETING', 'DELETED'])

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function describeError(env: Environment): string {
  const error = env.LastUpdate?.Error
  if (!error) return 'no error details were returned'
  return [error.ErrorCode, error.ErrorMessage].filter(Boolean).join(': ')
}

// Resolves with the final environment once our update has finished and the
// environment is AVAILABLE again; throws if the update fails or times out.
export async function waitForUpdate(options: WaitOptions): Promise<Environment> {
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  const start = now()

  for (;;) {
    const env = await options.fetch()
    const elapsed = Math.round((now() - start) / 1000)

    const update = env.LastUpdate
    const updatedAt = update?.CreatedAt?.getTime()
    // Until LastUpdate changes we may still be looking at the previous update.
    const isOurs = updatedAt !== options.previousUpdateAt
    options.onPoll?.(env, elapsed, isOurs)

    if (FAILED_STATUSES.has(env.Status ?? '')) {
      throw new UpdateFailedError(`Environment entered ${env.Status}: ${describeError(env)}`)
    }
    if (isOurs && update?.Status === 'FAILED') {
      throw new UpdateFailedError(`Environment update failed: ${describeError(env)}`)
    }
    if (isOurs && env.Status === 'AVAILABLE' && update?.Status === 'SUCCESS') {
      return env
    }

    if (elapsed + options.pollIntervalSeconds > options.timeoutSeconds) {
      throw new WaitTimeoutError(
        `Timed out after ${elapsed}s waiting for the environment to become AVAILABLE (status: ${env.Status ?? 'unknown'}).`
      )
    }
    await sleep(options.pollIntervalSeconds * 1000)
  }
}
