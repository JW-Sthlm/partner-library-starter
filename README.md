# Partner Library Starter

A small, opinionated starter for building a curated link library or knowledge site for a partner ecosystem. Static, Markdown-driven, deploys to Azure Static Web Apps. Optional analytics. Optional access gating.

> **This is a personal experiment by Johan Wallquist. It is not a Microsoft product, not officially endorsed by Microsoft, and provided as-is with no support commitments.** See [SUPPORT.md](SUPPORT.md).

## What you get

- **VitePress** static site (Vue 3 under the hood). No backend.
- **Markdown content** in `docs/`. Edit a file, push, deploy.
- **Azure Static Web Apps** as the deploy target. Free tier is enough.
- **Optional Application Insights** wiring. Tracks page views, unique visitors, outbound clicks. Silently no-ops when not configured.
- **Optional Entra ID gating**. Ship public by default, switch on later if you need access control.
- **Optional weekly KPI report** sample. Runs locally, emails via Outlook.

## What this is not

- Not a CMS. Content is files in git.
- Not a multi-tenant SaaS.
- Not a Microsoft-supported product. You own your fork end to end.

## Quick start (5 minutes)

```bash
# 1. Use this template on GitHub ("Use this template" button), then clone your new repo.
git clone https://github.com/<your-user>/<your-repo>.git
cd <your-repo>

# 2. Install
npm install

# 3. Run locally
npm run docs:dev
# Opens http://localhost:5173
```

That's the core. Everything below is optional.

## Deploy to Azure Static Web Apps (recommended)

The easiest path is the Azure Portal. Don't try to ship the example workflow as-is.

1. Sign in to [portal.azure.com](https://portal.azure.com).
2. Create a new **Static Web App**.
   - Plan: **Free** is fine.
   - Source: **GitHub**, point at your forked repo and `main` branch.
   - Build presets: **Custom**.
   - **App location:** `docs`
   - **Api location:** *(leave blank)*
   - **Output location:** `docs/.vitepress/dist`
3. Azure auto-creates a workflow file in `.github/workflows/` and adds the `AZURE_STATIC_WEB_APPS_API_TOKEN_*` secret to your repo. Push, and your first deploy runs.

**A reference example workflow lives at `.github/workflows/azure-static-web-apps.yml.example`.** It is intentionally inactive (no `.yml` extension, no secrets wired). It exists so you can see the full deploy shape if you ever want to hand-author one. The Portal-generated workflow is the supported path.

## Optional: analytics

The site reads a build-time env var `VITE_APPINSIGHTS_CONNECTION_STRING`. When unset, all telemetry calls no-op and the site works normally. When set, you get page views, unique visitors, and outbound link tracking in Application Insights.

To turn it on:

1. **Provision Application Insights.** Easiest in the Portal: search "Application Insights" → Create. Pick **workspace-based**. Note the connection string from the resource overview.
2. **Add a GitHub secret** in your repo: `Settings → Secrets and variables → Actions → New repository secret`
   - Name: `VITE_APPINSIGHTS_CONNECTION_STRING`
   - Value: paste the connection string
3. **Update the workflow** to inject the secret at build time. The Portal-generated workflow does NOT include this. Add this `env:` block to the `Install and build` step:

   ```yaml
   - name: Install and build
     env:
       VITE_APPINSIGHTS_CONNECTION_STRING: ${{ secrets.VITE_APPINSIGHTS_CONNECTION_STRING }}
     run: |
       npm ci
       npm run docs:build
   ```

4. Push. Next deploy bakes the connection string into the static bundle.

> **Security note:** the App Insights browser connection string is embedded in the built site by design. It is not a privileged secret. Anyone viewing your site source can read it. Treat it like a public identifier, not a credential. Never put privileged Azure auth in `VITE_*` env vars.

See [OPERATIONS.md](OPERATIONS.md) for KQL queries you can run against your data.

## Optional: gate access with Entra ID

The default `staticwebapp.config.json` ships with **anonymous access**. The site is public.

To require sign-in with Entra ID, see [`docs/auth/entra-gating.md`](docs/auth/entra-gating.md). It's not a one-line change. Real setup needs an Entra app registration, redirect URIs, and SWA app settings. The doc walks through it. A reference config lives at [`staticwebapp.config.entra.example.json`](staticwebapp.config.entra.example.json).

## Optional: weekly KPI email report

A sample script that queries Application Insights for last-week metrics and emails an HTML summary.

- `scripts/weekly-analytics-report.ps1.example` — the script (Windows + Outlook).
- `scripts/register-weekly-report-task.ps1.example` — registers a Windows Task Scheduler entry.

Both are templates. You'll need to edit the parameter defaults to point at your own AppInsights resource and resource group. See [OPERATIONS.md](OPERATIONS.md) for setup.

The script depends on Outlook COM, so it's Windows + Outlook only. A cross-platform / cloud-scheduled version is not included in v1. If you need cloud scheduling, the suggested approach is to wrap the same KQL queries in your preferred CI runner with your tenant's outbound mail option.

## Template reset checklist

After you click "Use this template" and clone, run through this:

- [ ] Update site title in `docs/.vitepress/config.ts`
- [ ] Replace sample pages in `docs/` with your own content
- [ ] Update navigation/sidebar in `docs/.vitepress/config.ts`
- [ ] Decide on deploy: Portal SWA wizard (recommended) or hand-author from the example
- [ ] Decide on analytics: provision App Insights and add the secret, or leave disabled
- [ ] Decide on gating: leave public, or follow `docs/auth/entra-gating.md`
- [ ] Update `LICENSE` copyright line to your name/org
- [ ] Edit `SUPPORT.md` and `README.md` to remove "this is Johan's experiment" framing and replace with your project's voice
- [ ] Delete `.github/workflows/*.example` and `scripts/*.example` if you're not using them

## Stack

- [VitePress 1.x](https://vitepress.dev/) - static site generator (Vue 3 + Vite)
- [Application Insights JS SDK](https://learn.microsoft.com/azure/azure-monitor/app/javascript) - optional analytics
- [Azure Static Web Apps](https://learn.microsoft.com/azure/static-web-apps/) - hosting + auth + routing
- Node.js 20 or 22

## License

MIT. See [LICENSE](LICENSE).

## Support

None. See [SUPPORT.md](SUPPORT.md). Fork, adapt, learn from it. PRs and issues are welcome but won't be triaged on any schedule.
