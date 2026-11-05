import * as core from '@actions/core'
import {
  GetEnvironmentCommand,
  MWAAClient,
  UpdateEnvironmentCommand,
  type Environment,
  type UpdateEnvironmentCommandInput
} from '@aws-sdk/client-mwaa'
import {
  bold,
  cyan,
  dim,
  formatValue,
  green,
  logStatus,
  pollLine,
  summaryDot,
  summaryStatus,
  type Tone
} from './format.ts'
import { parseInputs, type ActionInputs } from './inputs.ts'
import { WaitError, waitForUpdate } from './wait.ts'

const OUTPUTS: Array<[name: string, read: (env: Environment) => string | undefined]> = [
  ['status', (e) => e.Status],
  ['last-update-status', (e) => e.LastUpdate?.Status],
  ['environment-arn', (e) => e.Arn],
  ['airflow-version', (e) => e.AirflowVersion],
  ['requirements-s3-object-version', (e) => e.RequirementsS3ObjectVersion],
  ['plugins-s3-object-version', (e) => e.PluginsS3ObjectVersion],
  ['startup-script-s3-object-version', (e) => e.StartupScriptS3ObjectVersion]
]

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)

const requestedChanges = (request: UpdateEnvironmentCommandInput): Array<[string, unknown]> =>
  Object.entries(request).filter(([field]) => field !== 'Name')

async function finish(inputs: ActionInputs, env: Environment, outcome: string, tone: Tone): Promise<void> {
  for (const [name, read] of OUTPUTS) core.setOutput(name, read(env) ?? '')

  const header = (a: string, b: string) => [
    { data: a, header: true },
    { data: b, header: true }
  ]
  await core.summary
    .addHeading(`MWAA environment update: ${escapeHtml(inputs.name)}`, 2)
    .addRaw(`${summaryDot(tone)} ${outcome}`, true)
    .addHeading('Requested changes', 3)
    .addTable([
      header('Setting', 'Value'),
      ...requestedChanges(inputs.request).map(([field, value]) => [
        field,
        `<code>${escapeHtml(formatValue(value))}</code>`
      ])
    ])
    .addHeading('Environment', 3)
    .addTable([
      header('Field', 'Value'),
      ['Status', summaryStatus(env.Status)],
      ['Last update', summaryStatus(env.LastUpdate?.Status)],
      ['Airflow version', env.AirflowVersion ?? ''],
      ['requirements.txt version', env.RequirementsS3ObjectVersion ?? ''],
      ['plugins.zip version', env.PluginsS3ObjectVersion ?? ''],
      ['startup script version', env.StartupScriptS3ObjectVersion ?? '']
    ])
    .write()
}

export interface RunDependencies {
  client?: Pick<MWAAClient, 'send'>
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export async function run(deps: RunDependencies = {}): Promise<void> {
  const inputs = parseInputs((input) => core.getInput(input))
  const { name } = inputs
  const client = deps.client ?? new MWAAClient(inputs.region ? { region: inputs.region } : {})
  const getEnvironment = async (): Promise<Environment> => {
    const { Environment: env } = await client.send(new GetEnvironmentCommand({ Name: name }))
    if (!env) throw new Error(`Environment '${name}' was not found.`)
    return env
  }

  core.startGroup(bold(`Requested changes for ${cyan(name)}`))
  for (const [field, value] of requestedChanges(inputs.request)) {
    core.info(`  ${dim(field.padEnd(30))} ${formatValue(value)}`)
  }
  core.endGroup()

  const before = await getEnvironment()
  core.info(`Current status: ${logStatus(before.Status)}`)
  if (before.Status !== 'AVAILABLE') {
    throw new Error(`Environment is ${before.Status}; it must be AVAILABLE before it can be updated.`)
  }

  core.info(`Submitting update to ${cyan(name)}...`)
  await client.send(new UpdateEnvironmentCommand(inputs.request))
  core.info(green('Update accepted by MWAA.'))

  if (!inputs.wait) {
    core.info(dim('Not waiting (wait: false); the environment will keep updating in the background.'))
    return finish(inputs, await getEnvironment(), 'Update submitted; not waiting for completion.', 'busy')
  }

  core.startGroup(bold(`Waiting for ${name} to become AVAILABLE`))
  let env: Environment
  try {
    env = await waitForUpdate({
      fetch: getEnvironment,
      previousUpdateAt: before.LastUpdate?.CreatedAt?.getTime(),
      pollIntervalSeconds: inputs.pollIntervalSeconds,
      timeoutSeconds: inputs.timeoutSeconds,
      sleep: deps.sleep,
      now: deps.now,
      onPoll: (e, elapsed, isOurs) => core.info(pollLine(e.Status, e.LastUpdate?.Status, elapsed, isOurs))
    })
  } catch (error) {
    if (error instanceof WaitError) {
      await finish(inputs, error.environment, `**Failed:** ${escapeHtml(error.message)}`, 'fail')
    }
    throw error
  } finally {
    core.endGroup()
  }

  core.info(green(`● ${name} is AVAILABLE and the update succeeded.`))
  await finish(inputs, env, 'Update completed successfully.', 'ok')
}
