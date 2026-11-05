import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatValue, logStatus, pollLine, summaryDot, summaryStatus, toneOf } from '../src/format.ts'

const ESC = '\u001b'

describe('toneOf', () => {
  const cases: Array<[string | undefined, string]> = [
    ['AVAILABLE', 'ok'],
    ['SUCCESS', 'ok'],
    ['UPDATING', 'busy'],
    ['CREATING_SNAPSHOT', 'busy'],
    ['PENDING', 'busy'],
    ['ROLLING_BACK', 'warn'],
    ['MAINTENANCE', 'warn'],
    ['FAILED', 'fail'],
    ['UPDATE_FAILED', 'fail'],
    ['UNAVAILABLE', 'fail'],
    [undefined, 'idle']
  ]
  for (const [status, tone] of cases) {
    it(`maps ${status ?? 'undefined'} to ${tone}`, () => assert.equal(toneOf(status), tone))
  }
})

describe('logStatus', () => {
  it('colors the dot and status with ANSI', () => {
    assert.equal(logStatus('AVAILABLE'), `${ESC}[32m● AVAILABLE${ESC}[0m`)
    assert.equal(logStatus('UPDATING'), `${ESC}[94m● UPDATING${ESC}[0m`)
    assert.equal(logStatus('UPDATE_FAILED'), `${ESC}[31m● UPDATE_FAILED${ESC}[0m`)
  })

  it('accepts a tone override and a missing status', () => {
    assert.equal(logStatus(undefined), `${ESC}[90m● unknown${ESC}[0m`)
    assert.equal(logStatus(''), `${ESC}[90m● unknown${ESC}[0m`)
    assert.equal(logStatus('AVAILABLE', 'idle'), `${ESC}[90m● AVAILABLE${ESC}[0m`)
  })
})

describe('summaryStatus', () => {
  it('uses colored circle emoji without ANSI codes', () => {
    assert.equal(summaryStatus('AVAILABLE'), '🟢 AVAILABLE')
    assert.equal(summaryStatus('UPDATING'), '🔵 UPDATING')
    assert.equal(summaryStatus('ROLLING_BACK'), '🟡 ROLLING_BACK')
    assert.equal(summaryStatus('FAILED'), '🔴 FAILED')
    assert.equal(summaryStatus(undefined), '⚪')
    assert.equal(summaryDot('ok'), '🟢')
  })
})

describe('pollLine', () => {
  it('shows the update status and elapsed time for this run', () => {
    const line = pollLine('UPDATING', 'PENDING', 270, true)
    assert.ok(line.startsWith(logStatus('UPDATING')))
    assert.match(line, /update: PENDING, 270s/)
  })

  it('shows a gray waiting line while the previous update is still reported', () => {
    const line = pollLine('AVAILABLE', 'SUCCESS', 0, false)
    assert.ok(line.startsWith(logStatus('AVAILABLE', 'idle')))
    assert.match(line, /waiting for MWAA to start the update, 0s/)
  })

  it('handles a missing update status', () => {
    assert.match(pollLine('UPDATING', undefined, 5, true), /update: n\/a, 5s/)
  })
})

describe('formatValue', () => {
  it('prints scalars as-is and objects as JSON', () => {
    assert.equal(formatValue('mw1.small'), 'mw1.small')
    assert.equal(formatValue(3), '3')
    assert.equal(formatValue({ 'core.x': 'y' }), '{"core.x":"y"}')
  })
})
