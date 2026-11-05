# How the action works

The design choices behind the action and what happens during a run.

On this page:

- [SDK instead of the CLI](#sdk-instead-of-the-cli)
- [Partial updates](#partial-updates)
- [The run](#the-run)
- [Telling this update from the last one](#telling-this-update-from-the-last-one)

## SDK instead of the CLI

The action calls `UpdateEnvironment` and `GetEnvironment` through the AWS SDK for JavaScript v3, bundled into `dist/`. That is the API behind `aws mwaa update-environment`, so the runner needs no AWS CLI and CLI releases can't change the action's behavior. Credentials come from the SDK's default provider chain, which reads the environment variables `configure-aws-credentials` exports. MWAA CLI and web login tokens aren't involved: they run Airflow commands against the web server and aren't needed to manage the environment.

## Partial updates

Inputs map one-to-one to `UpdateEnvironment` fields. An unset input is left out of the request, and MWAA keeps the current value for any field the request omits, so a one-input call such as `max-workers: 10` doesn't disturb anything else. An empty input means unset, which is why the action can't clear an S3 path with an empty string.

Enumerated values pass through to the API instead of an allow-list in the action, apart from `worker-replacement-strategy`. A value MWAA adds later, such as `PUBLIC_AND_PRIVATE` for `webserver-access-mode`, works as soon as the API accepts it.

## The run

1. Parse and validate the inputs, with no AWS calls.
2. Call `GetEnvironment`. The environment must be `AVAILABLE`, and `LastUpdate.CreatedAt` is recorded.
3. Call `UpdateEnvironment`.
4. With `wait: true`, poll `GetEnvironment` until the update finishes or the timeout passes.
5. Call `GetEnvironment` once more, set the outputs, and write the job summary.

## Telling this update from the last one

Right after `UpdateEnvironment` returns, `GetEnvironment` can still report `AVAILABLE` with the previous update's `SUCCESS`, which would end the wait before the update starts. The action ignores any `LastUpdate` whose `CreatedAt` matches the value recorded in step 2, and logs those polls as waiting for MWAA to start the update. Environment-level failures (`UPDATE_FAILED`, `UNAVAILABLE`) fail the wait regardless of the timestamp, because they describe the environment's current state.
