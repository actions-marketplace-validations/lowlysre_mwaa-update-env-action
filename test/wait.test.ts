import type { Environment } from '@aws-sdk/client-mwaa'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { UpdateFailedError, WaitTimeoutError, waitForUpdate } from '../src/wait.ts'

const OLD = new Date('2026-01-01T00:00:00Z')
const NEW = new Date('2026-01-02T00:00:00Z')

const env = (
  status: string,
  updateStatus: string,
  createdAt: Date = NEW,
  error?: { ErrorCode: string; ErrorMessage: string }
): Environment => ({
  Status: status,
  LastUpdate: { Status: updateStatus, CreatedAt: createdAt, Error: error }
}) as Environment

function harness(responses: Environment[], timeoutSeconds = 3600) {
  let calls = 0
  let clock = 0
  return {
    calls: () => calls,
    run: () =>
      waitForUpdate({
        fetch: async () => responses[Math.min(calls++, responses.length - 1)]!,
        previousUpdateAt: OLD.getTime(),
        pollIntervalSeconds: 10,
        timeoutSeconds,
        sleep: async (ms) => {
          clock += ms
        },
        now: () => clock
      })
  }
}

const badRequirements = { ErrorCode: '1000', ErrorMessage: 'bad requirements' }

describe('waitForUpdate', () => {
  it('polls until AVAILABLE with a successful new update', async () => {
    const h = harness([env('UPDATING', 'PENDING'), env('CREATING_SNAPSHOT', 'PENDING'), env('AVAILABLE', 'SUCCESS')])
    const final = await h.run()
    assert.equal(final.Status, 'AVAILABLE')
    assert.equal(h.calls(), 3)
  })

  it('ignores the previous update while the new one has not appeared yet', async () => {
    const h = harness([
      env('AVAILABLE', 'SUCCESS', OLD),
      env('AVAILABLE', 'FAILED', OLD),
      env('UPDATING', 'PENDING'),
      env('AVAILABLE', 'SUCCESS')
    ])
    await h.run()
    assert.equal(h.calls(), 4)
  })

  it('keeps waiting through ROLLING_BACK, then fails on UPDATE_FAILED', async () => {
    const h = harness([env('ROLLING_BACK', 'PENDING'), env('UPDATE_FAILED', 'FAILED', NEW, badRequirements)])
    await assert.rejects(h.run(), UpdateFailedError)
    assert.equal(h.calls(), 2)
  })

  it('fails when the new LastUpdate is FAILED and includes the error', async () => {
    const h = harness([env('UPDATING', 'PENDING'), env('UPDATING', 'FAILED', NEW, badRequirements)])
    await assert.rejects(h.run(), /1000: bad requirements/)
  })

  it('fails when the environment becomes UNAVAILABLE', async () => {
    await assert.rejects(harness([env('UNAVAILABLE', 'PENDING')]).run(), /UNAVAILABLE/)
  })

  it('times out when the environment never becomes AVAILABLE', async () => {
    const h = harness([env('UPDATING', 'PENDING')], 30)
    await assert.rejects(h.run(), WaitTimeoutError)
    assert.equal(h.calls(), 4)
  })

  it('reports progress for each poll', async () => {
    const seen: Array<[string | undefined, number]> = []
    let clock = 0
    const responses = [env('UPDATING', 'PENDING'), env('AVAILABLE', 'SUCCESS')]
    let i = 0
    await waitForUpdate({
      fetch: async () => responses[i++]!,
      previousUpdateAt: undefined,
      pollIntervalSeconds: 10,
      timeoutSeconds: 100,
      sleep: async (ms) => {
        clock += ms
      },
      now: () => clock,
      onPoll: (e, elapsed) => seen.push([e.Status, elapsed])
    })
    assert.deepEqual(seen, [['UPDATING', 0], ['AVAILABLE', 10]])
  })

  it('treats a first-ever update (no previous timestamp) as ours', async () => {
    const final = await waitForUpdate({
      fetch: async () => env('AVAILABLE', 'SUCCESS'),
      previousUpdateAt: undefined,
      pollIntervalSeconds: 1,
      timeoutSeconds: 10
    })
    assert.equal(final.Status, 'AVAILABLE')
  })
})
