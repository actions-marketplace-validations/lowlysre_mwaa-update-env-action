# Recipes

Both examples use [mwaa-get-env-action](https://github.com/lowlysre/mwaa-get-env-action) to read the environment and this action to change it. The two actions use the same output names for the fields they share (`status`, `last-update-status`, `environment-arn`, `airflow-version`, and the `*-s3-object-version` values), so `steps.before.outputs.requirements-s3-object-version` and `steps.after.outputs.requirements-s3-object-version` read the same way.

> [!NOTE]
> Neither action has a published release yet. The examples use `@v1` as a placeholder for the release tag. Replace it with a real tag, or a full commit SHA, once one exists.

The AWS role needs `airflow:GetEnvironment` and `airflow:UpdateEnvironment`, plus `s3:PutObject` on the bucket for the upload step. See [AWS credentials and permissions](aws-credentials.md).

## Read, update, and confirm

This workflow reads the environment, uploads a new `requirements.txt`, applies it and waits for `AVAILABLE`, then reads the environment again to confirm it runs the uploaded version.

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

## Report what changed

Add this step after the update to write the previous and new versions to the job summary:

```yaml
      - name: Summarize the change
        env:
          BEFORE: ${{ steps.before.outputs.requirements-s3-object-version }}
          AFTER: ${{ steps.update.outputs.requirements-s3-object-version }}
          AIRFLOW: ${{ steps.update.outputs.airflow-version }}
        run: |
          {
            echo "### MWAA requirements.txt"
            echo
            echo "| Airflow | Before | After |"
            echo "| --- | --- | --- |"
            echo "| $AIRFLOW | \`$BEFORE\` | \`$AFTER\` |"
          } >> "$GITHUB_STEP_SUMMARY"
```
