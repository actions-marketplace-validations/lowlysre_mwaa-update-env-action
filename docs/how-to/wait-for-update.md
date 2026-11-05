# Wait for an update to finish

`UpdateEnvironment` returns as soon as MWAA accepts the change. The environment then moves through `UPDATING` and back to `AVAILABLE`, which usually takes 20 to 30 minutes. Set `wait: true` to hold the step until that happens.

```yaml
- uses: lowlysre/mwaa-update-env-action@v1
  with:
    name: my-environment
    airflow-version: 2.10.3
    wait: true
    poll-interval: 60
    timeout: 5400
```

## When the step succeeds

The environment is `AVAILABLE` and the update this run submitted has `LastUpdate.Status` of `SUCCESS`.

## When the step fails

| Condition | Result |
| --- | --- |
| `LastUpdate.Status` is `FAILED` for this run's update | Fails with the MWAA error code and message. |
| Environment status becomes `UPDATE_FAILED` | Fails. MWAA restored the previous state. |
| Environment status becomes `UNAVAILABLE` | Fails. The environment didn't return to a stable state. |
| `timeout` seconds pass | Fails. The update keeps running in MWAA. |

`ROLLING_BACK` and `CREATING_SNAPSHOT` keep polling. A rollback ends in `UPDATE_FAILED`, which fails the step.

Outputs and the job summary are written on failure too, so a later step with `if: always()` can read `status` and `last_update_status`.

## Choose a timeout

The default `timeout` of 3600 seconds covers most updates. Raise it when:

- You upgrade `airflow-version`, which takes longer than a configuration change.
- You use `worker-replacement-strategy: GRACEFUL`. MWAA lets running tasks finish for up to 12 hours before replacing workers, so a busy environment can take most of that.

Cap the whole job with `timeout-minutes` on the job as well, so a stuck wait can't hold a runner.

## Don't wait

With `wait: false`, the step returns after MWAA accepts the update and reads the environment once. The outputs usually show `UPDATING`. Use this when a later job or an external check owns the wait.

## Updates that start from a non-`AVAILABLE` environment

MWAA rejects an update while the environment is already changing. The action checks first and fails immediately with the current status, without submitting anything. Wait for the earlier update to finish, then rerun.
