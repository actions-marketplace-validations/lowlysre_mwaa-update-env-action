# How the action works

## SDK instead of the CLI

The action runs on Node and calls `UpdateEnvironment` and `GetEnvironment` through the AWS SDK for JavaScript v3, bundled into `dist/`. The SDK is the same API surface the `aws mwaa update-environment` command wraps. The runner needs no AWS CLI, and CLI releases that add or change options can't affect the action's behavior.

Credentials come from the SDK's default provider chain, which reads the environment variables `configure-aws-credentials` exports. MWAA CLI tokens and web login tokens aren't involved: those are for running Airflow commands against the web server, not for managing the environment.

## Partial updates

Inputs map one-to-one to `UpdateEnvironment` fields. An unset input is left out of the request, and MWAA keeps the current value for any field the request omits. This makes a one-input call such as `max-workers: 10` safe against drift in everything else.

## The run

1. Parse and validate the inputs, with no AWS calls.
2. Call `GetEnvironment`. The environment must be `AVAILABLE`, and `LastUpdate.CreatedAt` is recorded.
3. Call `UpdateEnvironment`.
4. If `wait` is true, poll `GetEnvironment` until the update finishes or the timeout passes.
5. Call `GetEnvironment` once more, set the outputs, and write the job summary.

## Telling this update from the last one

Right after `UpdateEnvironment` returns, `GetEnvironment` can still report `AVAILABLE` with the previous update's `SUCCESS`. Treating that as done would end the wait before the update starts.

The action records `LastUpdate.CreatedAt` before submitting and ignores any `LastUpdate` with the same timestamp. A new timestamp means MWAA has recorded this run's update, and only then do `SUCCESS` and `FAILED` count.

Environment-level failure statuses (`UPDATE_FAILED`, `UNAVAILABLE`) fail the wait regardless of the timestamp, because they describe the environment's current state.

## Version-sensitive behavior

MWAA adds API fields over time, for example `PUBLIC_AND_PRIVATE` for `webserver-access-mode` and the ability to clear S3 paths with empty strings. The action passes enumerated values through to the API instead of keeping its own allow-list, apart from `worker-replacement-strategy`. A new value works as soon as MWAA accepts it, and MWAA reports the error for a value it doesn't.

Clearing an S3 path isn't supported because an empty input means "unset" and is omitted from the request.
