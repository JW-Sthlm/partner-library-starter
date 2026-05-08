# Security

## Reporting a vulnerability in this template

This is a personal experimental template. If you spot a real security issue in the template code (not in your fork's content or your Azure setup), please use [GitHub's private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) on this repo.

## Out of scope

- Issues in your forked copy of this template. Once you fork, it's yours.
- Issues in your Azure tenant, subscription, Static Web App, or Application Insights resource.
- Issues in Microsoft products. Do **not** report Microsoft product vulnerabilities here. Use [msrc.microsoft.com](https://msrc.microsoft.com/) for that.

## Hardening notes for your fork

- The `VITE_APPINSIGHTS_CONNECTION_STRING` is embedded in the built static bundle. It is **not** a privileged secret. Anyone visiting your site can read it from the JS bundle. This is by design. Do not put privileged Azure credentials in `VITE_*` env vars.
- The Azure Static Web Apps deployment token (`AZURE_STATIC_WEB_APPS_API_TOKEN_*`) **is** a real secret. Keep it in GitHub Actions secrets, never in code.
- If you enable Entra ID gating, treat the `AAD_CLIENT_SECRET` as a real secret. Store it in SWA application settings or Key Vault, not in source.
- Review your `staticwebapp.config.json` before deploying. The default ships open. Confirm that's what you want.
