# Reference workflow — NOT ACTIVE

This directory is intentionally light. The recommended way to set up deployment is to let the **Azure Static Web Apps Portal wizard** create the workflow file for you. It will generate a working YAML and add the deployment token as a repository secret in one step.

See the README under "Deploy to Azure Static Web Apps" for the full Portal flow.

## What's here

- `azure-static-web-apps.yml.example` — a reference workflow showing the full deploy shape, with the analytics secret injection already wired in. **It is named `.example` so GitHub does not auto-run it.** Don't rename it to `.yml` unless you understand each line and have the matching secrets set.

## When you might want to hand-author

If you're not using the Portal (e.g. deploying from a fork, running multiple environments, or doing something exotic), copy `azure-static-web-apps.yml.example` to `azure-static-web-apps.yml`, replace the placeholder secret name with your real one, and commit.

The Portal-generated workflow does **not** include the `VITE_APPINSIGHTS_CONNECTION_STRING` env injection. If you want analytics, you must edit the Portal-generated workflow and add the `env:` block to the build step. See the README "Optional: analytics" section.
