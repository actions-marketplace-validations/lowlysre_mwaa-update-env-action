import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import fc from 'fast-check'
import { parseInputs } from '../src/inputs.ts'

const INPUT_NAMES = [
  'name',
  'airflow-version',
  'requirements-s3-object-version',
  'min-workers',
  'max-workers',
  'schedulers',
  'worker-replacement-strategy',
  'airflow-configuration-options',
  'network-configuration',
  'wait',
  'poll-interval',
  'timeout'
]

// Property-based fuzzing: arbitrary input values must either parse cleanly or fail
// with a readable Error, never crash with a TypeError or produce a malformed request.
describe('parseInputs (fuzzed)', () => {
  it('returns a well-formed request or throws an Error for any input values', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.constantFrom(...INPUT_NAMES), fc.string({ maxLength: 40 })), (values) => {
        let result
        try {
          result = parseInputs((name) => values[name] ?? '')
        } catch (error) {
          assert.ok(error instanceof Error && !(error instanceof TypeError), String(error))
          assert.ok(error.message.length > 0)
          return
        }
        assert.equal(result.request.Name, (values.name ?? '').trim())
        assert.ok(Object.keys(result.request).length > 1)
        assert.ok(Number.isInteger(result.pollIntervalSeconds) && result.pollIntervalSeconds >= 1)
        assert.ok(Number.isInteger(result.timeoutSeconds) && result.timeoutSeconds >= 1)
      }),
      { numRuns: 500 }
    )
  })

  it('round-trips any positive worker count', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1_000_000 }), (count) => {
        const { request } = parseInputs((name) => ({ name: 'env', 'max-workers': String(count) })[name] ?? '')
        assert.equal(request.MaxWorkers, count)
      })
    )
  })
})
