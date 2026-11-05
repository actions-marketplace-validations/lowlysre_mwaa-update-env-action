# Guides

## AWS credentials and permissions

The action reads credentials from the standard AWS environment variables, so any step that exports them works. The usual choice is [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) with GitHub OIDC, which avoids long-lived access keys. The job needs `id-token: write`, and the role's trust policy should restrict the repository and branch that deploy.

```yaml
permissions:
  contents: read
  id-token: write

steps:
  - uses: aws-actions/configure-aws-credentials@v6
    with:
      role-to-assume: arn:aws:iam::123456789012:role/mwaa-deployer
      aws-region: us-east-1
```

The role needs two actions on the environment:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["airflow:GetEnvironment", "airflow:UpdateEnvironment"],
      "Resource": "arn:aws:airflow:us-east-1:123456789012:environment/my-environment"
    }
  ]
}
```

- `airflow:GetEnvironment` runs before the update, while waiting, and at the end for the outputs.
- Changing `execution-role-arn` also requires `iam:PassRole` on the new role.
- A step that uploads `requirements.txt`, `plugins.zip`, or the startup script needs `s3:PutObject` on a bucket with versioning enabled, so S3 returns a version ID.

## Wait for an update to finish

`UpdateEnvironment` returns as soon as MWAA accepts the change. The environment then moves through `UPDATING` and back to `AVAILABLE`, which usually takes 20 to 30 minutes. `wait: true` holds the step until that happens.

```yaml
- uses: lowlysre/mwaa-update-env-action@v1
  with:
    name: my-environment
    airflow-version: 2.10.3
    wait: true
    poll-interval: 60
    timeout: 5400
```

The step succeeds when the environment is `AVAILABLE` and the update this run submitted has `LastUpdate.Status` of `SUCCESS`. It fails when:

| Condition | Result |
| --- | --- |
| `LastUpdate.Status` is `FAILED` for this run's update | Fails with the MWAA error code and message. |
| Environment status becomes `UPDATE_FAILED` | Fails. MWAA restored the previous state. |
| Environment status becomes `UNAVAILABLE` | Fails. The environment didn't return to a stable state. |
| `timeout` seconds pass | Fails. The update keeps running in MWAA. |

`ROLLING_BACK` and `CREATING_SNAPSHOT` keep polling, and a rollback ends in `UPDATE_FAILED`. Outputs and the job summary are written on failure too.

Raise `timeout` for Airflow version upgrades and for `worker-replacement-strategy: GRACEFUL`, where MWAA waits up to 12 hours for running tasks. Set `timeout-minutes` on the job as well so a stuck wait can't hold a runner.

With `wait: false`, the step returns once MWAA accepts the update. Use that when a later job owns the wait.

## Read, update, and confirm

[mwaa-get-env-action](https://github.com/lowlysre/mwaa-get-env-action) reads an environment and shares this action's output names. This workflow reads the environment, uploads a new `requirements.txt`, applies it and waits for `AVAILABLE`, then reads the environment again to confirm.

> [!NOTE]
> Neither action has a published release yet. The examples use `@v1` as a placeholder for the release tag. Replace it with a real tag, or a full commit SHA, once one exists.

```yaml
name: Deploy requirements to MWAA

on:
  push:
    branches: [main]
    paths: [requirements.txt]

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false

      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      - id: before
        uses: lowlysre/mwaa-get-env-action@v1
        with:
          name: my-environment

      - id: upload
        env:
          BUCKET: ${{ vars.MWAA_BUCKET }}
          KEY: ${{ steps.before.outputs.requirements-s3-path }}
        run: |
          version=$(aws s3api put-object --bucket "$BUCKET" --key "$KEY" \
            --body requirements.txt --query VersionId --output text)
          echo "version=$version" >> "$GITHUB_OUTPUT"

      - id: update
        uses: lowlysre/mwaa-update-env-action@v1
        with:
          name: my-environment
          requirements-s3-path: ${{ steps.before.outputs.requirements-s3-path }}
          requirements-s3-object-version: ${{ steps.upload.outputs.version }}
          wait: true
          timeout: 5400

      - id: after
        uses: lowlysre/mwaa-get-env-action@v1
        with:
          name: my-environment

      - name: Confirm the deployed version
        env:
          EXPECTED: ${{ steps.upload.outputs.version }}
          ACTUAL: ${{ steps.after.outputs.requirements-s3-object-version }}
          STATUS: ${{ steps.after.outputs.status }}
        run: |
          if [ "$STATUS" != "AVAILABLE" ] || [ "$ACTUAL" != "$EXPECTED" ]; then
            echo "::error::Expected requirements.txt version $EXPECTED on an AVAILABLE environment, got $ACTUAL ($STATUS)"
            exit 1
          fi
```

- The first read supplies the existing `requirements-s3-path`, so the workflow doesn't hard-code a path that can drift from the environment.
- The update step already returns fresh outputs after waiting. The second read is an independent check, and it also works from a later job when the update ran with `wait: false`.
- To report what changed, read `steps.before.outputs.requirements-s3-object-version` and `steps.update.outputs.requirements-s3-object-version` in a later step and write both to `$GITHUB_STEP_SUMMARY`.

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `Environment is UPDATING; it must be AVAILABLE` | MWAA rejects updates while the environment is changing. Wait for the earlier update, then rerun. |
| Region error before any request | Set `aws-region` on `configure-aws-credentials` or pass the `region` input. |
| `configure-aws-credentials` fails to get a token | The job is missing `permissions: id-token: write`. |
| `Timed out after ...` | The wait hit `timeout`. The update continues in MWAA, so raise `timeout` and check the environment. |
| `Environment entered UPDATE_FAILED` | The update failed and MWAA restored the previous state. The log includes the error code and message. |
| `No update inputs were set` | Every update input was empty. Set at least one, and check that expressions don't resolve to empty strings. |
