# Reference

Every input except `name` is optional. The action sends only the inputs you set, so MWAA keeps the current value for everything else, and the step fails before calling AWS when no update input is set.

## Inputs

| Input | Description |
| --- | --- |
| `name` | Environment name. Required. |
| `region` | AWS region. Defaults to the region in the AWS environment variables, such as the one `configure-aws-credentials` sets. |
| `airflow-version` | Airflow version to upgrade or downgrade to. |
| `source-bucket-arn` | ARN of the S3 bucket that holds DAGs, plugins, requirements, and the startup script. |
| `execution-role-arn` | ARN of the execution role. |
| `dag-s3-path` | Relative path of the DAGs folder. |
| `plugins-s3-path`, `plugins-s3-object-version` | Path and S3 object version of `plugins.zip`. |
| `requirements-s3-path`, `requirements-s3-object-version` | Path and S3 object version of `requirements.txt`. |
| `startup-script-s3-path`, `startup-script-s3-object-version` | Path and S3 object version of the startup script. |
| `environment-class` | For example `mw1.small`. |
| `min-workers`, `max-workers` | Worker autoscaling bounds. |
| `min-webservers`, `max-webservers` | Web server autoscaling bounds. |
| `schedulers` | Scheduler count. |
| `worker-replacement-strategy` | `FORCED` replaces workers immediately. `GRACEFUL` lets running tasks finish for up to 12 hours first. Case-insensitive. |
| `webserver-access-mode` | `PRIVATE_ONLY`, `PUBLIC_ONLY`, or `PUBLIC_AND_PRIVATE` (Airflow 3.2 and later). |
| `weekly-maintenance-window-start` | For example `SAT:03:00`, in UTC, on 30 minute boundaries. |
| `network-configuration` | JSON object with `SecurityGroupIds`, for example `{"SecurityGroupIds":["sg-0abc"]}`. |
| `logging-configuration` | JSON object in the API's `LoggingConfiguration` shape, for example `{"TaskLogs":{"Enabled":true,"LogLevel":"INFO"}}`. |
| `airflow-configuration-options` | JSON object of Airflow options, for example `{"core.default_timezone":"utc"}`. |
| `wait` | `true` waits for the update to finish. Default `false`. |
| `poll-interval` | Seconds between status checks while waiting. Default `30`. |
| `timeout` | Seconds to wait before failing the step. Default `3600`. The update keeps running in MWAA. |

MWAA requires a new S3 object version each time `requirements.txt`, `plugins.zip`, or the startup script changes.

### Validation

These fail before any AWS call, with a message that names the input:

- Integer inputs that aren't whole numbers of at least 1, or a `min-*` value above its `max-*`
- JSON inputs that aren't JSON objects
- A `worker-replacement-strategy` other than `FORCED` or `GRACEFUL`, or a `wait` other than `true` or `false`

Values the API validates itself, such as `environment-class` and `airflow-version`, pass through, and MWAA returns the error.

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

Outputs come from a fresh `GetEnvironment` call at the end of the run. Without `wait` they usually show `UPDATING`. When a waited update fails, they are still set before the step fails, so a later step with `if: always()` can read them.

The names match the same fields in [mwaa-get-env-action](https://github.com/lowlysre/mwaa-get-env-action), so a workflow can read an environment before and after an update with one set of names. See the [guides](guides.md#read-update-and-confirm).
