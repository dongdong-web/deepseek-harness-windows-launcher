# Contributing

Thanks for helping make DeepSeek Harness easier for Windows users.

## Scope

This is an unofficial community launcher. Keep changes focused on the portable
Windows distribution, launcher reliability, release reproducibility, and
documentation. Do not represent changes as official DeepSeek support.

## Before opening a pull request

1. Do not commit `artifacts/`, logs, API keys, `.dsh-home`, or user workspaces.
2. Keep the private Node.js and PowerShell runtimes isolated; do not add global
   npm installs or modify the user's `PATH`.
3. Pin every updated runtime dependency and verify its checksum in
   `config/runtime-manifest.json`.
4. Update documentation and tests with behavior changes.

Run the relevant checks on Windows PowerShell:

```powershell
./scripts/build-runtime.ps1
./scripts/verify-runtime.ps1
./scripts/smoke-web.ps1
./artifacts/portable/DeepSeekHarness/runtime/node/node.exe ./tests/launcher-core-test.mjs
./tests/launcher-integration.ps1
./tests/portable-zip-test.ps1
./scripts/build-portable-zip.ps1 -SkipRuntimeBuild
./tests/portable-zip-e2e.ps1
```

## Bug reports

Use the bug-report template and include Windows version, launcher version,
commands used, and redacted logs. Never include an API key, token, workspace
contents, or personal paths you do not want published.
