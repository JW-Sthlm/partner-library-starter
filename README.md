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

## Before you start

You'll need:

| Requirement | Why | How to get it |
|-------------|-----|---------------|
| **GitHub account** | To use the template and host your repo | [github.com](https://github.com/signup) |
| **Azure subscription** | To host the Static Web App and (optional) Application Insights. Free tier covers this for most uses. | [azure.microsoft.com/free](https://azure.microsoft.com/free) |
| **Azure permissions** | Contributor on the subscription, or on a resource group you can use | Ask your Azure admin if unsure |
| **Node.js 22+** | To preview the site locally and run the build | [nodejs.org](https://nodejs.org/) |
| **PowerShell 7+** | The provisioning scripts are PowerShell. Cross-platform: Windows, macOS, Linux. | [Install PowerShell](https://learn.microsoft.com/powershell/scripting/install/installing-powershell) |
| **Azure CLI** (`az`) | Used by `bootstrap.ps1` to create resources | [Install az CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) |
| **GitHub CLI** (`gh`) | Used by `bootstrap.ps1` to set repo secrets and detect the remote | [cli.github.com](https://cli.github.com/) |
| **git** | To clone and push | Usually pre-installed; otherwise [git-scm.com](https://git-scm.com/) |

Sign in to both CLIs once:

```powershell
az login              # opens a browser, signs in to your Azure tenant
gh auth login         # opens a browser, signs in to GitHub
```

That's the full prerequisite list. Total cost on Azure with the Free SKU and modest traffic: about $0/month. Application Insights ingestion has a 5 GB/month free quota that is plenty for a small site.

## Set up your site (3 steps, ~5 minutes)

```powershell
# 1. Use this template on GitHub ("Use this template" button), then clone:
git clone https://github.com/<your-user>/<your-repo>.git
cd <your-repo>
npm install

# 2. Rebrand: site title, package name, copyright (interactive prompts)
.\scripts\rebrand.ps1

# 3. Provision Azure + GitHub secrets + activate workflow + push (one command)
.\scripts\bootstrap.ps1 -Name <short-slug>
```

After step 3 you have:

- A live site at `https://<random>-<random>.azurestaticapps.net` (printed by the script)
- Application Insights collecting page views and outbound clicks
- A working CI/CD pipeline that auto-deploys on every push to `main`
- Two GitHub secrets set automatically (`AZURE_STATIC_WEB_APPS_API_TOKEN`, `VITE_APPINSIGHTS_CONNECTION_STRING`)

What still needs your attention:

- `docs/` — sample pages for the structure. Replace with your real content.
- `README.md` and `SUPPORT.md` — the "Johan's experiment" framing. Rewrite to match your project's voice.
- Optional: gating with Entra ID. See [`docs/auth/entra-gating.md`](docs/auth/entra-gating.md).

## Local preview

```powershell
npm run docs:dev
# Opens http://localhost:5173, hot-reloads on file changes
```

## Deploy to Azure Static Web Apps

The bootstrap script above is the recommended flow. If you prefer to provision manually, two alternatives:

### Manual fallback: Azure Portal

If you'd rather click through the Portal:

1. Sign in to [portal.azure.com](https://portal.azure.com).
2. Create a new **Static Web App**.
   - Plan: **Free** is fine.
   - Source: **GitHub**, point at your forked repo and `main` branch.
   - Build presets: **Custom**.
   - **App location:** `docs`
   - **Api location:** *(leave blank)*
   - **Output location:** `docs/.vitepress/dist`
3. Azure auto-creates a workflow file in `.github/workflows/` and adds an `AZURE_STATIC_WEB_APPS_API_TOKEN_*` secret to your repo. Push, and your first deploy runs.
4. To enable analytics, see "Optional: analytics" below. The Portal-generated workflow does **not** inject `VITE_APPINSIGHTS_CONNECTION_STRING` for you. You'll need to patch it.

A reference workflow lives at `.github/workflows/azure-static-web-apps.yml.example` with the analytics env-injection already wired in. The bootstrap script renames this to the active filename. If you go the Portal route, either ignore the example or use it as a model for the Portal-generated one.

## Optional: analytics

If you used the bootstrap script, analytics is already wired. Skip this section.

Going manual? The site reads a build-time env var `VITE_APPINSIGHTS_CONNECTION_STRING`. When unset, all telemetry calls no-op and the site works normally. When set, you get page views, unique visitors, and outbound link tracking in Application Insights.

To turn it on after a Portal deploy:

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

## Template reset checklist

Most of this is automated by `scripts\rebrand.ps1` and `scripts\bootstrap.ps1`. The only fully-manual bits are:

- [ ] Replace sample pages in `docs/` with your real content
- [ ] Update navigation/sidebar in `docs/.vitepress/config.ts` if you change page paths
- [ ] Decide on gating: leave public, or follow `docs/auth/entra-gating.md`
- [ ] Edit `README.md` and `SUPPORT.md` to remove "this is Johan's experiment" framing and replace with your project's voice
- [ ] Optional: set `bootstrap.ps1 -SkipAnalytics` if you don't want telemetry (or skip running bootstrap entirely)
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
