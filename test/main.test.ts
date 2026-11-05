import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { run } from '../src/main.ts'

// Uses the real @actions/core: inputs come from INPUT_* env vars, outputs and the
// job summary are written to the files named by GITHUB_OUTPUT / GITHUB_STEP_SUMMARY.
const dir = mkdtempSync(join(tmpdir(), 'mwaa-action-'))
const outputFile = join(dir, 'output')
const summaryFile = join(dir, 'summary')
const managedEnv = ['GITHUB_OUTPUT', 'GITHUB_STEP_SUMMARY']
let touchedEnv: string[] = []

const setInputs = (values: Record<string, string>) => {
  for (const [name, value] of Object.entries(values)) {
    const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`
    process.env[key] = value
    touchedEnv.push(key)
  }
}

const readOutputs = (): Record<string, string> => {
  const out: Record<string, string> = {}
  // Multiline-safe parse of core's `name<<delimiter` format.
  const text = readFileSync(outputFile, 'utf8')
  for (const match of text.matchAll(/^(\S+)<<(\S+)\r?\n([\s\S]*?)\r?\n\2$/gm)) out[match[1]!] = match[3]!
  return out
}

const environment = (status: string, updateStatus: string, createdAt: string) => ({
  Environment: {
    Status: status,
    Arn: 'arn:aws:airflow:us-east-1:123456789012:environment/env1',
    AirflowVersion: '2.10.3',
    RequirementsS3ObjectVersion: 'rv1',
    PluginsS3ObjectVersion: 'pv1',
    StartupScriptS3ObjectVersion: 'sv1',
    LastUpdate: { Status: updateStatus, CreatedAt: new Date(createdAt) }
  }
})

function fakeClient(responses: unknown[]) {
  const sent: Array<[string, unknown]> = []
  let i = 0
  return {
    sent,
    client: {
      send: async (command: { constructor: { name: string }; input: unknown }) => {
        sent.push([command.constructor.name, command.input])
        return responses[Math.min(i++, responses.length - 1)]
      }
    } as never
  }
}

beforeEach(() => {
  writeFileSync(outputFile, '')
  writeFileSync(summaryFile, '')
  process.env.GITHUB_OUTPUT = outputFile
  process.env.GITHUB_STEP_SUMMARY = summaryFile
  touchedEnv = [...managedEnv]
  setInputs({ name: 'env1', 'min-workers': '2', 'poll-interval': '1', timeout: '60' })
})

afterEach(() => {
  for (const key of touchedEnv) delete process.env[key]
})

describe('run', () => {
  it('submits only the set fields and returns outputs without waiting', async () => {
    const { client, sent } = fakeClient([
      environment('AVAILABLE', 'SUCCESS', '2026-01-01'),
      { Arn: 'x' },
      environment('UPDATING', 'PENDING', '2026-01-02')
    ])

    await run({ client })

    assert.deepEqual(sent, [
      ['GetEnvironmentCommand', { Name: 'env1' }],
      ['UpdateEnvironmentCommand', { Name: 'env1', MinWorkers: 2 }],
      ['GetEnvironmentCommand', { Name: 'env1' }]
    ])
    assert.deepEqual(readOutputs(), {
      status: 'UPDATING',
      last_update_status: 'PENDING',
      arn: 'arn:aws:airflow:us-east-1:123456789012:environment/env1',
      airflow_version: '2.10.3',
      requirements_s3_object_version: 'rv1',
      plugins_s3_object_version: 'pv1',
      startup_script_s3_object_version: 'sv1'
    })
    const summary = readFileSync(summaryFile, 'utf8')
    assert.match(summary, /MWAA environment update: env1/)
    assert.match(summary, /MinWorkers/)
  })

  it('waits for the new update to finish when wait is true', async () => {
    setInputs({ wait: 'true' })
    const { client, sent } = fakeClient([
      environment('AVAILABLE', 'SUCCESS', '2026-01-01'),
      { Arn: 'x' },
      environment('AVAILABLE', 'SUCCESS', '2026-01-01'),
      environment('AVAILABLE', 'SUCCESS', '2026-01-02')
    ])

    await run({ client, sleep: async () => {} })

    const outputs = readOutputs()
    assert.equal(outputs.status, 'AVAILABLE')
    assert.equal(outputs['last_update_status'], 'SUCCESS')
    assert.equal(sent.length, 4)
  })

  it('refuses to update an environment that is not AVAILABLE', async () => {
    const { client, sent } = fakeClient([environment('UPDATING', 'PENDING', '2026-01-01')])
    await assert.rejects(run({ client }), /must be AVAILABLE/)
    assert.deepEqual(
      sent.map(([name]) => name),
      ['GetEnvironmentCommand']
    )
  })

  it('still sets outputs and fails when the update fails', async () => {
    setInputs({ wait: 'true' })
    const failed = environment('UPDATE_FAILED', 'FAILED', '2026-01-02')
    const { client } = fakeClient([environment('AVAILABLE', 'SUCCESS', '2026-01-01'), { Arn: 'x' }, failed])

    await assert.rejects(run({ client, sleep: async () => {} }), /UPDATE_FAILED/)

    const outputs = readOutputs()
    assert.equal(outputs.status, 'UPDATE_FAILED')
    assert.equal(outputs['last_update_status'], 'FAILED')
    assert.match(readFileSync(summaryFile, 'utf8'), /Failed/)
  })

  it('fails on invalid inputs before calling AWS', async () => {
    setInputs({ 'min-workers': 'two' })
    const { client, sent } = fakeClient([])
    await assert.rejects(run({ client }), /must be an integer/)
    assert.equal(sent.length, 0)
  })
})
