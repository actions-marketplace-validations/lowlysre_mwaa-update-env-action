import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseInputs } from '../src/inputs.ts'

const parse = (values: Record<string, string>) => parseInputs((name) => values[name] ?? '')

describe('parseInputs', () => {
  it('only includes inputs that were set', () => {
    const { request } = parse({
      name: 'env1',
      'min-workers': '2',
      'worker-replacement-strategy': 'graceful',
      'requirements-s3-object-version': 'abc'
    })
    assert.deepEqual(request, {
      Name: 'env1',
      MinWorkers: 2,
      WorkerReplacementStrategy: 'GRACEFUL',
      RequirementsS3ObjectVersion: 'abc'
    })
  })

  it('maps every string, integer and JSON input', () => {
    const { request } = parse({
      name: 'env1',
      'airflow-version': '2.10.3',
      'source-bucket-arn': 'arn:aws:s3:::b',
      'execution-role-arn': 'arn:aws:iam::123456789012:role/r',
      'dag-s3-path': 'dags',
      'plugins-s3-path': 'plugins.zip',
      'plugins-s3-object-version': 'pv',
      'requirements-s3-path': 'requirements.txt',
      'requirements-s3-object-version': 'rv',
      'startup-script-s3-path': 'startup.sh',
      'startup-script-s3-object-version': 'sv',
      'environment-class': 'mw1.small',
      'min-workers': '1',
      'max-workers': '5',
      'min-webservers': '2',
      'max-webservers': '4',
      schedulers: '2',
      'webserver-access-mode': 'PUBLIC_ONLY',
      'weekly-maintenance-window-start': 'SAT:03:00',
      'airflow-configuration-options': '{"core.default_timezone":"utc"}',
      'network-configuration': '{"SecurityGroupIds":["sg-1"]}',
      'logging-configuration': '{"TaskLogs":{"Enabled":true,"LogLevel":"INFO"}}'
    })
    assert.deepEqual(request, {
      Name: 'env1',
      AirflowVersion: '2.10.3',
      SourceBucketArn: 'arn:aws:s3:::b',
      ExecutionRoleArn: 'arn:aws:iam::123456789012:role/r',
      DagS3Path: 'dags',
      PluginsS3Path: 'plugins.zip',
      PluginsS3ObjectVersion: 'pv',
      RequirementsS3Path: 'requirements.txt',
      RequirementsS3ObjectVersion: 'rv',
      StartupScriptS3Path: 'startup.sh',
      StartupScriptS3ObjectVersion: 'sv',
      EnvironmentClass: 'mw1.small',
      MinWorkers: 1,
      MaxWorkers: 5,
      MinWebservers: 2,
      MaxWebservers: 4,
      Schedulers: 2,
      WebserverAccessMode: 'PUBLIC_ONLY',
      WeeklyMaintenanceWindowStart: 'SAT:03:00',
      AirflowConfigurationOptions: { 'core.default_timezone': 'utc' },
      NetworkConfiguration: { SecurityGroupIds: ['sg-1'] },
      LoggingConfiguration: { TaskLogs: { Enabled: true, LogLevel: 'INFO' } }
    })
  })

  it('trims whitespace and treats blank values as unset', () => {
    const { request } = parse({ name: ' env1 ', 'airflow-version': '  ', schedulers: ' 3 ' })
    assert.deepEqual(request, { Name: 'env1', Schedulers: 3 })
  })

  it('applies wait defaults', () => {
    const inputs = parse({ name: 'e', schedulers: '2' })
    assert.equal(inputs.wait, false)
    assert.equal(inputs.pollIntervalSeconds, 30)
    assert.equal(inputs.timeoutSeconds, 3600)
    assert.equal(inputs.region, undefined)
  })

  it('reads wait, region and polling settings', () => {
    const inputs = parse({
      name: 'e', schedulers: '2', wait: 'TRUE', region: 'us-west-2', 'poll-interval': '5', timeout: '60'
    })
    assert.equal(inputs.wait, true)
    assert.equal(inputs.pollIntervalSeconds, 5)
    assert.equal(inputs.timeoutSeconds, 60)
    assert.equal(inputs.region, 'us-west-2')
  })

  const invalid: Array<[string, Record<string, string>, RegExp]> = [
    ['missing name', { schedulers: '2' }, /'name' is required/],
    ['nothing to update', { name: 'e' }, /nothing to update/],
    ['bad strategy', { name: 'e', 'worker-replacement-strategy': 'SOON' }, /FORCED or GRACEFUL/],
    ['non-numeric workers', { name: 'e', 'max-workers': 'ten' }, /'max-workers' must be an integer/],
    ['zero workers', { name: 'e', 'min-workers': '0' }, /at least 1/],
    ['min above max workers', { name: 'e', 'min-workers': '5', 'max-workers': '2' }, /cannot exceed/],
    ['min above max webservers', { name: 'e', 'min-webservers': '5', 'max-webservers': '2' }, /cannot exceed/],
    ['invalid JSON', { name: 'e', 'network-configuration': '{bad' }, /valid JSON/],
    ['JSON array', { name: 'e', 'airflow-configuration-options': '[]' }, /JSON object/],
    ['bad wait', { name: 'e', schedulers: '2', wait: 'maybe' }, /'wait' must be/],
    ['zero poll interval', { name: 'e', schedulers: '2', 'poll-interval': '0' }, /at least 1/]
  ]
  for (const [label, values, message] of invalid) {
    it(`rejects ${label}`, () => {
      assert.throws(() => parse(values), message)
    })
  }
})
