import type { UpdateEnvironmentCommandInput } from '@aws-sdk/client-mwaa'

export interface ActionInputs {
  name: string
  request: UpdateEnvironmentCommandInput
  region: string | undefined
  wait: boolean
  pollIntervalSeconds: number
  timeoutSeconds: number
}

export type InputGetter = (name: string) => string

type Parse = (raw: string, input: string) => unknown

const text: Parse = (raw) => raw

function positiveInt(raw: string, input: string): number {
  if (!/^\d+$/.test(raw)) throw new Error(`Input '${input}' must be an integer, got '${raw}'.`)
  const value = Number(raw)
  if (value < 1) throw new Error(`Input '${input}' must be at least 1, got ${value}.`)
  return value
}

function jsonObject(raw: string, input: string): object {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Input '${input}' must be valid JSON: ${(error as Error).message}`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Input '${input}' must be a JSON object.`)
  }
  return value
}

const oneOf =
  (...allowed: string[]): Parse =>
  (raw, input) => {
    const value = raw.toUpperCase()
    if (!allowed.includes(value)) throw new Error(`Input '${input}' must be ${allowed.join(' or ')}, got '${raw}'.`)
    return value
  }

function boolean(raw: string, input: string): boolean {
  const value = raw.toLowerCase()
  if (value !== 'true' && value !== 'false')
    throw new Error(`Input '${input}' must be 'true' or 'false', got '${raw}'.`)
  return value === 'true'
}

// Each update input and the UpdateEnvironment field it fills. Unset inputs are left out of
// the request, so MWAA keeps the current value for those fields.
const FIELDS: Array<[input: string, field: keyof UpdateEnvironmentCommandInput, parse: Parse]> = [
  ['airflow-version', 'AirflowVersion', text],
  ['source-bucket-arn', 'SourceBucketArn', text],
  ['execution-role-arn', 'ExecutionRoleArn', text],
  ['dag-s3-path', 'DagS3Path', text],
  ['plugins-s3-path', 'PluginsS3Path', text],
  ['plugins-s3-object-version', 'PluginsS3ObjectVersion', text],
  ['requirements-s3-path', 'RequirementsS3Path', text],
  ['requirements-s3-object-version', 'RequirementsS3ObjectVersion', text],
  ['startup-script-s3-path', 'StartupScriptS3Path', text],
  ['startup-script-s3-object-version', 'StartupScriptS3ObjectVersion', text],
  ['environment-class', 'EnvironmentClass', text],
  ['webserver-access-mode', 'WebserverAccessMode', text],
  ['weekly-maintenance-window-start', 'WeeklyMaintenanceWindowStart', text],
  ['min-workers', 'MinWorkers', positiveInt],
  ['max-workers', 'MaxWorkers', positiveInt],
  ['min-webservers', 'MinWebservers', positiveInt],
  ['max-webservers', 'MaxWebservers', positiveInt],
  ['schedulers', 'Schedulers', positiveInt],
  ['worker-replacement-strategy', 'WorkerReplacementStrategy', oneOf('FORCED', 'GRACEFUL')],
  ['airflow-configuration-options', 'AirflowConfigurationOptions', jsonObject],
  ['network-configuration', 'NetworkConfiguration', jsonObject],
  ['logging-configuration', 'LoggingConfiguration', jsonObject]
]

const RANGES = [
  ['min-workers', 'max-workers'],
  ['min-webservers', 'max-webservers']
] as const

export function parseInputs(get: InputGetter): ActionInputs {
  const read = (input: string): string => get(input).trim()

  const name = read('name')
  if (!name) throw new Error("Input 'name' is required.")

  const parsed = new Map<string, unknown>()
  const request: Record<string, unknown> = { Name: name }
  for (const [input, field, parse] of FIELDS) {
    const raw = read(input)
    if (!raw) continue
    request[field] = parse(raw, input)
    parsed.set(input, request[field])
  }
  if (parsed.size === 0) throw new Error('No update inputs were set; nothing to update.')

  for (const [low, high] of RANGES) {
    const min = parsed.get(low) as number | undefined
    const max = parsed.get(high) as number | undefined
    if (min !== undefined && max !== undefined && min > max) {
      throw new Error(`Input '${low}' (${min}) cannot exceed '${high}' (${max}).`)
    }
  }

  return {
    name,
    request: request as unknown as UpdateEnvironmentCommandInput,
    region: read('region') || undefined,
    wait: boolean(read('wait') || 'false', 'wait'),
    pollIntervalSeconds: positiveInt(read('poll-interval') || '30', 'poll-interval'),
    timeoutSeconds: positiveInt(read('timeout') || '3600', 'timeout')
  }
}
