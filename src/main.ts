import * as core from '@actions/core'
import {
  GetEnvironmentCommand,
  MWAAClient,
  UpdateEnvironmentCommand,
  type Environment,
  type UpdateEnvironmentCommandInput
} from '@aws-sdk/client-mwaa'
import { parseInputs } from './inputs.ts'
import { UpdateFailedError, WaitTimeoutError, waitForUpdate } from './wait.ts'

const c = {
  green: (s: string) => `\u001b[32m${s}\u001b[0m`,
  red: (s: string) => `\u001b[31m${s}\u001b[0m`,
  yellow: (s: string) => `\u001b[33m${s}\u001b[0m`,
  cyan: (s: string) => `\u001b[36m${s}\u001b[0m`,
  dim: (s: string) => `\u001b[2m${s}\u001b[0m`,
  bold: (s: string) => `\u001b[1m${s}\u001b[0m`
}

const OUTPUT_FIELDS: Array<[string, (env: Environment) => string | undefined]> = [
  ['status', (e) => e.Status],
  ['last-update-status', (e) => e.LastUpdate?.Status],
  ['environment-arn', (e) => e.Arn],
  ['airflow-version', (e) => e.AirflowVersion],
  ['requirements-s3-object-version', (e) => e.RequirementsS3ObjectVersion],
  ['plugins-s3-object-version', (e) => e.PluginsS3ObjectVersion],
  ['startup-script-s3-object-version', (e) => e.StartupScriptS3ObjectVersion]
]

function setOutputs(env: Environment): void {
  for (const [name, read] of OUTPUT_FIELDS) core.setOutput(name, read(env) ?? '')
}

function statusIcon(status: string | undefined): string {
  if (status === 'AVAILABLE' || status === 'SUCCESS') return '✅'
  if (status === 'FAILED' || status?.endsWith('FAILED') || status === 'UNAVAILABLE') return '❌'
  return '⏳'
}

async function writeSummary(
  name: string,
  requested: UpdateEnvironmentCommandInput,
  env: Environment | undefined,
  outcome: string
): Promise<void> {
  const settings = Object.entries(requested)
    .filter(([key]) => key !== 'Name')
    .map(([key, value]) => [key, `<code>${typeof value === 'object' ? JSON.stringify(value) : String(value)}</code>`])

  core.summary
    .addHeading(`MWAA environment update: ${name}`, 2)
    .addRaw(`${statusIcon(env?.Status)} ${outcome}`, true)
    .addHeading('Requested changes', 3)
    .addTable([[{ data: 'Setting', header: true }, { data: 'Value', header: true }], ...settings])

  if (env) {
    core.summary.addHeading('Environment', 3).addTable([
      [{ data: 'Field', header: true }, { data: 'Value', header: true }],
      ['Status', `${statusIcon(env.Status)} ${env.Status ?? ''}`],
      ['Last update', `${statusIcon(env.LastUpdate?.Status)} ${env.LastUpdate?.Status ?? ''}`],
      ['Airflow version', env.AirflowVersion ?? ''],
      ['requirements.txt version', env.RequirementsS3ObjectVersion ?? ''],
      ['plugins.zip version', env.PluginsS3ObjectVersion ?? ''],
      ['startup script version', env.StartupScriptS3ObjectVersion ?? '']
    ])
  }
  await core.summary.write()
}

export interface RunDependencies {
  client?: Pick<MWAAClient, 'send'>
  sleep?: (ms: number) => Promise<void>
}

export async function run(deps: RunDependencies = {}): Promise<void> {
  const inputs = parseInputs((name) => core.getInput(name))
  const name = inputs.request.Name as string
  const client = deps.client ?? new MWAAClient(inputs.region ? { region: inputs.region } : {})
  const getEnvironment = async (): Promise<Environment> => {
    const { Environment: env } = await client.send(new GetEnvironmentCommand({ Name: name }))
    if (!env) throw new Error(`Environment '${name}' was not found.`)
    return env
  }

  core.startGroup(c.bold(`Requested changes for ${c.cyan(name)}`))
  for (const [key, value] of Object.entries(inputs.request)) {
    if (key !== 'Name') core.info(`  ${c.dim(key.padEnd(30))} ${typeof value === 'object' ? JSON.stringify(value) : value}`)
  }
  core.endGroup()

  const before = await getEnvironment()
  core.info(`Current status: ${c.cyan(before.Status ?? 'unknown')}`)
  if (before.Status !== 'AVAILABLE') {
    throw new Error(`Environment is ${before.Status}; it must be AVAILABLE before it can be updated.`)
  }
  const previousUpdateAt = before.LastUpdate?.CreatedAt?.getTime()

  core.info(`🚀 Submitting update to ${c.cyan(name)}...`)
  await client.send(new UpdateEnvironmentCommand(inputs.request))
  core.info(c.green('Update accepted by MWAA.'))

  let final: Environment
  if (inputs.wait) {
    core.startGroup(c.bold(`Waiting for ${name} to become AVAILABLE`))
    try {
      final = await waitForUpdate({
        fetch: getEnvironment,
        previousUpdateAt,
        sleep: deps.sleep,
        pollIntervalSeconds: inputs.pollIntervalSeconds,
        timeoutSeconds: inputs.timeoutSeconds,
        onPoll: (env, elapsed) =>
          core.info(`${statusIcon(env.Status)} ${c.yellow(env.Status ?? '?')} ${c.dim(`(update: ${env.LastUpdate?.Status ?? 'n/a'}, ${elapsed}s)`)}`)
      })
    } catch (error) {
      core.endGroup()
      // Still publish whatever state we can see before failing the step.
      const latest = await getEnvironment().catch(() => undefined)
      if (latest) setOutputs(latest)
      if (error instanceof UpdateFailedError || error instanceof WaitTimeoutError) {
        await writeSummary(name, inputs.request, latest, `**Failed:** ${error.message}`)
      }
      throw error
    }
    core.endGroup()
    core.info(c.green(`✅ ${name} is AVAILABLE and the update succeeded.`))
  } else {
    final = await getEnvironment()
    core.info(c.dim('Not waiting (wait: false); the environment will keep updating in the background.'))
  }

  setOutputs(final)
  await writeSummary(
    name,
    inputs.request,
    final,
    inputs.wait ? 'Update completed successfully.' : 'Update submitted; not waiting for completion.'
  )
}
