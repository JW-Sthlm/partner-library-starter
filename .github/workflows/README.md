# Reference workflow

This directory ships one workflow file as `.example`. The included `scripts/bootstrap.ps1` activates it for you when you provision Azure resources.

## What's here

- `azure-static-web-apps.yml.example` — the deploy workflow with analytics env-injection already wired in. The `.example` suffix prevents GitHub Actions from running it before you have the matching secrets set.

## How it gets activated

Two ways:

1. **Bootstrap script (recommended).** `scripts/bootstrap.ps1` provisions Azure, sets the `AZURE_STATIC_WEB_APPS_API_TOKEN` and `VITE_APPINSIGHTS_CONNECTION_STRING` secrets, renames this file to `azure-static-web-apps.yml`, commits, and pushes. First deploy fires automatically. See the root README.
2. **Manual.** Rename `azure-static-web-apps.yml.example` to `azure-static-web-apps.yml`, set both secrets in `Settings → Secrets and variables → Actions`, then push.

## Azure Portal alternative

If you provision your Static Web App through the Azure Portal wizard instead, the Portal generates its own workflow file with the deployment token name baked in (e.g. `AZURE_STATIC_WEB_APPS_API_TOKEN_HAPPY_DESERT_12345`). The Portal-generated workflow does **not** include the `VITE_APPINSIGHTS_CONNECTION_STRING` env injection. If you want analytics with that flow, edit the Portal-generated workflow and add the `env:` block from the example file. See the README "Optional: analytics" section.

