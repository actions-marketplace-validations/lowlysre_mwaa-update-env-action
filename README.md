<p align="center">
  <img src="docs/public/social-card.png" alt="MWAA Update Environment: update Amazon MWAA from GitHub Actions and wait until it is available again" width="720">
</p>

<p align="center">
  <a href="https://github.com/lowlysre/mwaa-update-env-action/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/lowlysre/mwaa-update-env-action/actions/workflows/ci.yml/badge.svg"></a>
  <a href="https://github.com/lowlysre/mwaa-update-env-action/actions/workflows/codeql.yml"><img alt="CodeQL" src="https://github.com/lowlysre/mwaa-update-env-action/actions/workflows/codeql.yml/badge.svg"></a>
  <a href="https://scorecard.dev/viewer/?uri=github.com/lowlysre/mwaa-update-env-action"><img alt="OpenSSF Scorecard" src="https://api.scorecard.dev/projects/github.com/lowlysre/mwaa-update-env-action/badge"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/lowlysre/mwaa-update-env-action"></a>
</p>

# MWAA Update Environment

Ship a new `requirements.txt`, bump the worker count, or upgrade Airflow on an Amazon MWAA environment straight from a workflow, and optionally hold the step until the environment is `AVAILABLE` again. If the update fails, so does the step, with MWAA's error message in the log.

It uses the AWS credentials the job already has, so there are no MWAA CLI tokens to juggle and no AWS CLI needed on the runner. Run [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) first and you're set.

- 📦 Two runtime dependencies, `@actions/core` and the AWS SDK's MWAA client, bundled into `dist/` with their [license notices](dist/THIRD_PARTY_NOTICES.txt).
- 🔒 Immutable releases: once a release is published, its tag and assets are locked, so pinning `v1.0.0` gets you exactly the code you reviewed.
- 🛡️ Locked-down CI: every job runs [harden-runner](https://github.com/step-security/harden-runner) with outbound traffic blocked except for listed endpoints, and zizmor (pedantic), CodeQL, and OpenSSF Scorecard check the repo.

Built and maintained by [lowlysre](https://github.com/lowlysre) 🐍. It's an independent project, not affiliated with or endorsed by AWS.

## Quick start

This example assumes the repository can use GitHub OIDC to assume an AWS role that can update the environment. See [AWS credentials and permissions](docs/guides.md#aws-credentials-and-permissions) for the trust policy and the IAM actions the role needs.

```yaml
permissions:
  contents: read
  id-token: write

steps:
  - uses: actions/checkout@v7

  - uses: aws-actions/configure-aws-credentials@v6
    with:
      role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
      aws-region: us-east-1

  - id: upload
    name: Upload requirements.txt
    run: |
      version=$(aws s3api put-object --bucket my-mwaa-bucket --key requirements.txt \
        --body requirements.txt --query VersionId --output text)
      echo "version=$version" >> "$GITHUB_OUTPUT"

  - id: mwaa
    uses: lowlysre/mwaa-update-env-action@v1
    with:
      name: my-environment
      requirements-s3-path: requirements.txt
      requirements-s3-object-version: ${{ steps.upload.outputs.version }}
      wait: true
      timeout: 3600

  - run: echo "Now running requirements.txt ${{ steps.mwaa.outputs.requirements-s3-object-version }}"
```

MWAA requires a new S3 object version each time `requirements.txt`, `plugins.zip`, or the startup script changes, which is why the upload step captures the version ID. Pin third-party actions to full commit SHAs in production workflows.

With `wait: true`, the step succeeds once the environment is `AVAILABLE` and the update it submitted shows `SUCCESS`. A typical update takes 20 to 30 minutes. See [wait for an update to finish](docs/guides.md#wait-for-an-update-to-finish) to size `timeout` and read the failure modes.

## Features

While it waits, each poll prints a colored status dot (green done, blue in progress, yellow rolling back, red failed), and every run ends with a job summary of the final environment state.

| Feature | Behavior |
| --- | --- |
| Wait mode | Polls until your update finishes. `FAILED`, `UPDATE_FAILED`, `UNAVAILABLE`, or a timeout fails the step with MWAA's error code and message. |
| Input validation | Bad numbers, bad JSON, or a `min-*` above its `max-*` fail the step before anything reaches AWS. |
| Outputs | Status, last update status, ARN, Airflow version, and the S3 object versions in use, set even when a waited update fails. |
| No AWS CLI | Talks to MWAA through the AWS SDK, so the runner's CLI version doesn't matter. |

## This action or the AWS CLI

You can run `aws mwaa update-environment` in a `run` step. Here's what you'd be writing yourself.

| Need | This action | AWS CLI in a `run` step |
| --- | --- | --- |
| Update environment settings | ✅ | ✅ |
| Wait for the update to finish | ✅ `wait: true` | Poll `get-environment` in a script |
| Tell a new update from the previous one while polling | ✅ | Compare `LastUpdate.CreatedAt` yourself |
| Fail the step with the MWAA error message | ✅ | Parse `LastUpdate.Error` yourself |
| Step log groups and job summary | ✅ | ❌ |
| Needs the AWS CLI on the runner | No | Yes |

How the pieces fit together is in [how the action works](docs/how-it-works.md).

## Related actions

- [mwaa-get-env-action](https://github.com/lowlysre/mwaa-get-env-action) reads an environment with `GetEnvironment` and exposes its status, Airflow version, and the S3 paths and object versions it runs. Use it to read the current state before an update or to confirm the result afterward. Its output names match this action's, for example `status`, `last-update-status`, and `requirements-s3-object-version`.

The [guides](docs/guides.md#read-update-and-confirm) combine both: read the environment, upload and apply a change, wait for `AVAILABLE`, and confirm the deployed version.

## Documentation

- [Reference](docs/reference.md): every input and output, and what fails validation
- [Guides](docs/guides.md): credentials, waiting, a combined workflow with mwaa-get-env-action, and troubleshooting
- [How the action works](docs/how-it-works.md)
- [Contributing](.github/CONTRIBUTING.md)

## License

Copyright 2026 lowlysre / John McCall. This action is licensed under the [MIT License](LICENSE).

The action runs a bundled build in `dist/` that includes third-party code, mainly the AWS SDK for JavaScript (Apache-2.0) and the GitHub Actions toolkit (MIT). [dist/THIRD_PARTY_NOTICES.txt](dist/THIRD_PARTY_NOTICES.txt) lists every bundled package with its license text and attributions, and the build regenerates it with [third-party-notices](https://www.npmjs.com/package/third-party-notices).

AWS, Amazon MWAA, and Amazon S3 are trademarks of Amazon.com, Inc. or its affiliates. This project is independent and not affiliated with or endorsed by AWS.
