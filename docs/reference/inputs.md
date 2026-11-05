# Inputs and outputs

Every input except `name` is optional. The action sends only the inputs you set, so MWAA keeps the current value for everything else. The step fails before calling AWS when no update input is set.

## Inputs

### Environment

| Input | Description |
| --- | --- |
| `name` | Environment name. Required. |
| `region` | AWS region. Defaults to the region from the AWS environment variables, such as the one `configure-aws-credentials` sets. |

### Versions and resources

| Input | Description |
| --- | --- |
| `airflow-version` | Airflow version to upgrade or downgrade to. |
| `source-bucket-arn` | ARN of the S3 bucket that holds DAGs, plugins, requirements, and the startup script. |
| `execution-role-arn` | ARN of the execution role. |
| `dag-s3-path` | Relative path of the DAGs folder in the source bucket. |
| `plugins-s3-path` | Relative path of `plugins.zip`. |
| `plugins-s3-object-version` | S3 object version of `plugins.zip`. |
| `requirements-s3-path` | Relative path of `requirements.txt`. |
| `requirements-s3-object-version` | S3 object version of `requirements.txt`. |
| `startup-script-s3-path` | Relative path of the startup script. |
| `startup-script-s3-object-version` | S3 object version of the startup script. |

MWAA requires a new object version each time one of these files changes. See [update requirements.txt](../../README.md#quick-start) in the quick start for capturing the version ID on upload.

### Capacity

| Input | Description |
| --- | --- |
| `environment-class` | For example `mw1.small`. |
| `min-workers`, `max-workers` | Worker autoscaling bounds. |
| `min-webservers`, `max-webservers` | Web server autoscaling bounds. |
| `schedulers` | Scheduler count. |
| `worker-replacement-strategy` | `FORCED` stops and replaces workers immediately. `GRACEFUL` lets running tasks finish for up to 12 hours first. Case-insensitive. |

### Networking, access, and logging

| Input | Description |
| --- | --- |
| `webserver-access-mode` | `PRIVATE_ONLY`, `PUBLIC_ONLY`, or `PUBLIC_AND_PRIVATE` (Airflow 3.2 and later). |
| `weekly-maintenance-window-start` | For example `SAT:03:00`, in UTC, on 30 minute boundaries. |
| `network-configuration` | JSON object with `SecurityGroupIds`, for example `{"SecurityGroupIds":["sg-0abc"]}`. |
| `logging-configuration` | JSON object in the API's `LoggingConfiguration` shape, for example `{"TaskLogs":{"Enabled":true,"LogLevel":"INFO"}}`. |
| `airflow-configuration-options` | JSON object of Airflow options, for example `{"core.default_timezone":"utc"}`. |

### Waiting

| Input | Default | Description |
| --- | --- | --- |
| `wait` | `false` | `true` waits for the update to finish. |
| `poll-interval` | `30` | Seconds between status checks. |
| `timeout` | `3600` | Seconds to wait before failing the step. The update keeps running in MWAA. |

## Validation

The action rejects these before calling AWS, with a message that names the input:

- Integer inputs that aren't whole numbers of at least 1
- `min-workers` above `max-workers`, or `min-webservers` above `max-webservers`
- JSON inputs that aren't valid JSON objects
- `worker-replacement-strategy` other than `FORCED` or `GRACEFUL`
- `wait` other than `true` or `false`

Values the API validates itself, such as `environment-class` and `airflow-version`, are passed through. MWAA returns the error.

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

Outputs reflect a fresh `GetEnvironment` call at the end of the run. The names match the same fields in [mwaa-get-env-action](https://github.com/lowlysre/mwaa-get-env-action), so a workflow can read the environment before and after an update with one set of names. See the [recipes](../how-to/recipes.md). Without `wait`, they usually show `UPDATING`. When a waited update fails, the outputs are still set before the step fails, so later steps with `if: always()` can read them.
