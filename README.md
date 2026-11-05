# MWAA Update Environment

Updates an Amazon MWAA environment with `UpdateEnvironment`, the API behind `aws mwaa update-environment`, and optionally waits until the environment is `AVAILABLE` again.

The action authenticates with ordinary AWS credentials from the environment, so it works after [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) with no MWAA CLI tokens. It calls the AWS SDK for JavaScript directly, so the runner needs no AWS CLI and the behavior doesn't depend on the CLI version.

## Usage

```yaml
permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/mwaa-deployer
          aws-region: us-east-1

      - id: mwaa
        uses: lowlysre/mwaa-update-env-action@v1
        with:
          name: my-environment
          requirements-s3-path: requirements.txt
          requirements-s3-object-version: ${{ steps.upload.outputs.requirements-version }}
          worker-replacement-strategy: GRACEFUL
          wait: true
          timeout: 5400

      - run: echo "requirements.txt version ${{ steps.mwaa.outputs.requirements-s3-object-version }}"
```

Only inputs you set are sent. Settings you leave out keep their current value in MWAA. The action fails before calling AWS if no update input is set.

## Inputs

| Input | Description |
| --- | --- |
| `name` | Environment name. Required. |
| `airflow-version` | Airflow version to upgrade or downgrade to. |
| `source-bucket-arn` | ARN of the S3 bucket that holds DAGs, plugins, requirements and the startup script. |
| `execution-role-arn` | ARN of the execution role. |
| `dag-s3-path` | Relative path of the DAGs folder. |
| `plugins-s3-path`, `plugins-s3-object-version` | Path and S3 object version of `plugins.zip`. |
| `requirements-s3-path`, `requirements-s3-object-version` | Path and S3 object version of `requirements.txt`. |
| `startup-script-s3-path`, `startup-script-s3-object-version` | Path and S3 object version of the startup script. |
| `environment-class` | For example `mw1.small`. |
| `min-workers`, `max-workers` | Worker autoscaling bounds. |
| `min-webservers`, `max-webservers` | Web server autoscaling bounds. |
| `schedulers` | Scheduler count. |
| `worker-replacement-strategy` | `FORCED` stops workers immediately. `GRACEFUL` lets running tasks finish for up to 12 hours. |
| `webserver-access-mode` | `PRIVATE_ONLY`, `PUBLIC_ONLY`, or `PUBLIC_AND_PRIVATE` (Airflow 3.2 and later). |
| `weekly-maintenance-window-start` | For example `SAT:03:00`, in UTC, on 30 minute boundaries. |
| `airflow-configuration-options` | JSON object, for example `{"core.default_timezone":"utc"}`. |
| `network-configuration` | JSON object with `SecurityGroupIds`. |
| `logging-configuration` | JSON object in the API's `LoggingConfiguration` shape. |
| `region` | AWS region. Defaults to the region from the AWS environment variables. |
| `wait` | `true` waits for the update to finish. Default `false`. |
| `poll-interval` | Seconds between status checks while waiting. Default `30`. |
| `timeout` | Seconds to wait before failing. Default `3600`. |

Integer inputs must be at least 1, `min-*` can't exceed `max-*`, and the JSON inputs must be JSON objects. Invalid values fail the step with a message naming the input.

## Outputs

| Output | Description |
| --- | --- |
| `status` | Environment status when the action finished, for example `AVAILABLE` or `UPDATING`. |
| `last-update-status` | `SUCCESS`, `PENDING`, or `FAILED`. |
| `environment-arn` | Environment ARN. |
| `airflow-version` | Airflow version in use. |
| `requirements-s3-object-version` | `requirements.txt` version in use. |
| `plugins-s3-object-version` | `plugins.zip` version in use. |
| `startup-script-s3-object-version` | Startup script version in use. |

Outputs are set after the update is submitted, and also when a waited update fails, so later steps with `if: always()` can read them.

## Waiting

With `wait: true`, the action polls `GetEnvironment` every `poll-interval` seconds.

- It succeeds when the environment is `AVAILABLE` and the update it submitted has `LastUpdate.Status` of `SUCCESS`. A previous update's result is ignored until MWAA records the new one.
- It fails when `LastUpdate.Status` is `FAILED`, or when the environment reaches `UPDATE_FAILED` or `UNAVAILABLE`. The error code and message from MWAA appear in the log.
- `ROLLING_BACK` and `CREATING_SNAPSHOT` keep polling.
- It fails after `timeout` seconds. The update keeps running in MWAA.

MWAA updates commonly take 20 to 30 minutes, and a `GRACEFUL` replacement can take up to 12 hours, so raise `timeout` to match.

The environment must be `AVAILABLE` when the action starts. Otherwise MWAA rejects the update, and the action fails early with the current status.

Each run writes a job summary with the requested changes and the final environment state.

## Permissions

The AWS role needs these actions on the environment:

- `airflow:GetEnvironment`
- `airflow:UpdateEnvironment`

Changing `execution-role-arn` also requires `iam:PassRole` on the new role.

## Development

```sh
npm ci
npm run check   # typecheck and tests
npm run build   # bundles src/ into dist/
```

Tests run on the built-in Node test runner. `dist/` is committed because the action runs it directly, and CI fails when it is stale.

## License

[MIT](LICENSE)
