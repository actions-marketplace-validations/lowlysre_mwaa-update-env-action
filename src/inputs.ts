import type { UpdateEnvironmentCommandInput } from '@aws-sdk/client-mwaa'

export interface ActionInputs {
  request: UpdateEnvironmentCommandInput
  region: string | undefined
  wait: boolean
  pollIntervalSeconds: number
  timeoutSeconds: number
}

export type InputGetter = (name: string) => string

const STRINGS: Record<string, keyof UpdateEnvironmentCommandInput> = {
  'airflow-version': 'AirflowVersion',
  'source-bucket-arn': 'SourceBucketArn',
  'execution-role-arn': 'ExecutionRoleArn',
  'dag-s3-path': 'DagS3Path',
  'plugins-s3-path': 'PluginsS3Path',
  'plugins-s3-object-version': 'PluginsS3ObjectVersion',
  'requirements-s3-path': 'RequirementsS3Path',
  'requirements-s3-object-version': 'RequirementsS3ObjectVersion',
  'startup-script-s3-path': 'StartupScriptS3Path',
  'startup-script-s3-object-version': 'StartupScriptS3ObjectVersion',
  'environment-class': 'EnvironmentClass',
  'webserver-access-mode': 'WebserverAccessMode',
  'weekly-maintenance-window-start': 'WeeklyMaintenanceWindowStart'
}

const INTEGERS: Record<string, { key: keyof UpdateEnvironmentCommandInput; min: number }> = {
  'min-workers': { key: 'MinWorkers', min: 1 },
  'max-workers': { key: 'MaxWorkers', min: 1 },
  'min-webservers': { key: 'MinWebservers', min: 1 },
  'max-webservers': { key: 'MaxWebservers', min: 1 },
  schedulers: { key: 'Schedulers', min: 1 }
}

const JSON_INPUTS: Record<string, keyof UpdateEnvironmentCommandInput> = {
  'airflow-configuration-options': 'AirflowConfigurationOptions',
  'network-configuration': 'NetworkConfiguration',
  'logging-configuration': 'LoggingConfiguration'
}

function parseJsonObject(name: string, raw: string): unknown {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new Error(`Input '${name}' must be valid JSON: ${(error as Error).message}`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Input '${name}' must be a JSON object.`)
  }
  return value
}

function parsePositiveInt(name: string, raw: string, min: number): number {
  if (!/^\d+$/.test(raw)) throw new Error(`Input '${name}' must be an integer, got '${raw}'.`)
  const value = Number(raw)
  if (value < min) throw new Error(`Input '${name}' must be at least ${min}, got ${value}.`)
  return value
}

// Unset inputs are never sent, so the API leaves those settings untouched.
export function parseInputs(get: InputGetter): ActionInputs {
  const read = (name: string): string => get(name).trim()

  const name = read('name')
  if (!name) throw new Error("Input 'name' is required.")

  const request: Record<string, unknown> = { Name: name }
  let changes = 0

  for (const [input, key] of Object.entries(STRINGS)) {
    const value = read(input)
    if (value) {
      request[key] = value
      changes++
    }
  }
  for (const [input, { key, min }] of Object.entries(INTEGERS)) {
    const value = read(input)
    if (value) {
      request[key] = parsePositiveInt(input, value, min)
      changes++
    }
  }
  for (const [input, key] of Object.entries(JSON_INPUTS)) {
    const value = read(input)
    if (value) {
      request[key] = parseJsonObject(input, value)
      changes++
    }
  }

  const strategy = read('worker-replacement-strategy').toUpperCase()
  if (strategy) {
    if (strategy !== 'FORCED' && strategy !== 'GRACEFUL') {
      throw new Error(`Input 'worker-replacement-strategy' must be FORCED or GRACEFUL, got '${strategy}'.`)
    }
    request.WorkerReplacementStrategy = strategy
    changes++
  }

  if (changes === 0) throw new Error('No update inputs were set; nothing to update.')

  const min = request.MinWorkers as number | undefined
  const max = request.MaxWorkers as number | undefined
  if (min !== undefined && max !== undefined && min > max) {
    throw new Error(`Input 'min-workers' (${min}) cannot exceed 'max-workers' (${max}).`)
  }
  const minWeb = request.MinWebservers as number | undefined
  const maxWeb = request.MaxWebservers as number | undefined
  if (minWeb !== undefined && maxWeb !== undefined && minWeb > maxWeb) {
    throw new Error(`Input 'min-webservers' (${minWeb}) cannot exceed 'max-webservers' (${maxWeb}).`)
  }

  const waitRaw = read('wait').toLowerCase() || 'false'
  if (waitRaw !== 'true' && waitRaw !== 'false') {
    throw new Error(`Input 'wait' must be 'true' or 'false', got '${waitRaw}'.`)
  }

  return {
    request: request as unknown as UpdateEnvironmentCommandInput,
    region: read('region') || undefined,
    wait: waitRaw === 'true',
    pollIntervalSeconds: parsePositiveInt('poll-interval', read('poll-interval') || '30', 1),
    timeoutSeconds: parsePositiveInt('timeout', read('timeout') || '3600', 1)
  }
}
