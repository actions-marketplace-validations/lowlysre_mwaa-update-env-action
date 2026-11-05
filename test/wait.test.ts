import type { Environment } from '@aws-sdk/client-mwaa'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UpdateFailedError, WaitTimeoutError, waitForUpdate, type WaitOptions } from '../src/wait.ts'

const OLD = new Date('2026-01-01T00:00:00Z')
const NEW = new Date('2026-01-02T00:00:00Z')
const badRequirements = { ErrorCode: '1000', ErrorMessage: 'bad requirements' }

const env = (status: string, updateStatus: string, createdAt = NEW, error?: typeof badRequirements): Environment =>
  ({ Status: status, LastUpdate: { Status: updateStatus, CreatedAt: createdAt, Error: error } }) as Environment

// Replays responses (repeating the last), with a fake clock advanced by sleep().
function harness(responses: Environment[], options: Partial<WaitOptions> = {}) {
  let calls = 0
  let clock = 0
  const polls: Array<{ status?: string; elapsed: number; isOurs: boolean }> = []
  const run = () =>
    waitForUpdate({
      fetch: async () => responses[Math.min(calls++, responses.length - 1)]!,
      previousUpdateAt: OLD.getTime(),
      pollIntervalSeconds: 10,
      timeoutSeconds: 3600,
      sleep: async (ms) => {
        clock += ms
      },
      now: () => clock,
      onPoll: (e, elapsed, isOurs) => polls.push({ status: e.Status, elapsed, isOurs }),
      ...options
    })
  return { run, polls, calls: () => calls }
}

describe('waitForUpdate', () => {
  it('polls until AVAILABLE with a successful new update', async () => {
    const h = harness([env('UPDATING', 'PENDING'), env('CREATING_SNAPSHOT', 'PENDING'), env('AVAILABLE', 'SUCCESS')])
    assert.equal((await h.run()).Status, 'AVAILABLE')
    assert.deepEqual(
      h.polls.map((p) => [p.status, p.elapsed]),
      [
        ['UPDATING', 0],
        ['CREATING_SNAPSHOT', 10],
        ['AVAILABLE', 20]
      ]
    )
  })

  it('ignores the previous update until MWAA records the new one', async () => {
    const h = harness([
      env('AVAILABLE', 'SUCCESS', OLD),
      env('AVAILABLE', 'FAILED', OLD),
      env('UPDATING', 'PENDING'),
      env('AVAILABLE', 'SUCCESS')
    ])
    await h.run()
    assert.deepEqual(
      h.polls.map((p) => p.isOurs),
      [false, false, true, true]
    )
  })

  it('treats any update as new when there was no previous one', async () => {
    const h = harness([env('AVAILABLE', 'SUCCESS')], { previousUpdateAt: undefined })
    await h.run()
    assert.equal(h.calls(), 1)
  })

  it('keeps waiting through ROLLING_BACK, then fails on UPDATE_FAILED with the environment attached', async () => {
    const failed = env('UPDATE_FAILED', 'FAILED', NEW, badRequirements)
    const h = harness([env('ROLLING_BACK', 'PENDING'), failed])
    await assert.rejects(h.run(), (error) => error instanceof UpdateFailedError && error.environment === failed)
    assert.equal(h.calls(), 2)
  })

  it('fails when the new LastUpdate is FAILED and includes the error', async () => {
    const h = harness([env('UPDATING', 'PENDING'), env('UPDATING', 'FAILED', NEW, badRequirements)])
    await assert.rejects(h.run(), /1000: bad requirements/)
  })

  it('says so when MWAA returns no error details', async () => {
    await assert.rejects(harness([env('UNAVAILABLE', 'PENDING')]).run(), /UNAVAILABLE: no error details were returned/)
  })

  it('times out with the last environment attached', async () => {
    const h = harness([env('UPDATING', 'PENDING')], { timeoutSeconds: 30 })
    await assert.rejects(
      h.run(),
      (error) =>
        error instanceof WaitTimeoutError && error.environment.Status === 'UPDATING' && /after 30s/.test(error.message)
    )
    assert.equal(h.calls(), 4)
  })
})
