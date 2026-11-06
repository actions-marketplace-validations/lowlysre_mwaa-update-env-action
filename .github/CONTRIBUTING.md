# Contributing

The action is TypeScript, bundled with esbuild into `dist/index.cjs`, which is the file the runner executes.

```sh
npm ci
npm run check   # typecheck and tests
npm run build   # bundles src/ into dist/
```

- Tests use the built-in Node test runner and run `.ts` files directly, so use Node 24 or later. `npm test` also measures coverage and fails below 100% lines, 90% branches, or 95% functions. Raise the thresholds in `package.json` when coverage improves.
- Commit `dist/` with any change under `src/`, including `dist/THIRD_PARTY_NOTICES.txt`, which the build generates with [third-party-notices](https://www.npmjs.com/package/third-party-notices) from the production dependencies' license files. A package that ships no license file is skipped with a warning (`allowMissing` in `third-party-notices.config.json`). CI rebuilds and fails when `dist/` differs.
- `test/main.test.ts` runs the real `@actions/core` against temp files and injects a fake MWAA client. Add new behavior there, and put pure logic in `test/inputs.test.ts` or `test/wait.test.ts`.
- Pin new `uses:` entries in workflows to full commit SHAs with the release tag as a comment, and put `step-security/harden-runner` first in every job with `egress-policy: block` and the endpoints that job needs.
- Lint configs live in `.github/linters/`, which MegaLinter reads by default, and the workflow sets `MEGALINTER_CONFIG` to `.github/linters/.mega-linter.yml`. Keep tool config out of the repository root. Format with `npx prettier --config .github/linters/.prettierrc.json --write <files>`.
- Run `zizmor --persona pedantic .github` (CI uses the same persona) and `actionlint` before changing workflows.
