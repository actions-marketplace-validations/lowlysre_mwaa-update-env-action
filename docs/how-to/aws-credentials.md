# AWS credentials and permissions

The action reads credentials from the standard AWS environment variables, so any step that exports them works. The usual choice is [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials) with GitHub OIDC, which avoids long-lived access keys.

## Authenticate with OIDC

```yaml
permissions:
  contents: read
  id-token: write

steps:
  - uses: aws-actions/configure-aws-credentials@v6
    with:
      role-to-assume: arn:aws:iam::123456789012:role/mwaa-deployer
      aws-region: us-east-1

  - uses: lowlysre/mwaa-update-env-action@v1
    with:
      name: my-environment
      environment-class: mw1.medium
```

The `id-token: write` permission is what lets the job request the OIDC token. Without it, `configure-aws-credentials` fails before this action runs.

Set the region on `configure-aws-credentials` or pass the `region` input. The action fails with a region error when neither is set.

## Trust policy

Restrict the role to the repository and branch that deploys:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:my-org/my-repo:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

## Permissions policy

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
- `airflow:UpdateEnvironment` submits the change.
- Changing `execution-role-arn` also requires `iam:PassRole` on the new role.
- A step that uploads `requirements.txt`, `plugins.zip`, or the startup script before this action needs `s3:PutObject` on the bucket, with versioning enabled so S3 returns a version ID.
