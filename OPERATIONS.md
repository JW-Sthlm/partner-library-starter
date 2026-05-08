# Operations Guide

Day-two stuff: how to provision the optional Azure resources, how to use the analytics, how to run the weekly KPI report. Use this as a runbook, not a tutorial.

For the basic local-dev and deploy flow, see the [README](README.md).

---

## 1. Provision Application Insights (optional, for analytics)

The site runs fine without analytics. Set it up only if you want to see who's visiting.

### Recommended: Azure Portal

1. Sign in to [portal.azure.com](https://portal.azure.com).
2. Search **Application Insights** → **+ Create**.
3. Pick a subscription and resource group. Create a new resource group if you want isolation.
4. Name: something like `appi-partner-library`.
5. Region: pick one close to your users.
6. **Resource Mode:** **Workspace-based** (the default for new resources). Create a new Log Analytics workspace if you don't have one.
7. Review + create.
8. Once provisioned, open the resource and copy the **Connection String** from the overview pane.

### Alternative: Azure CLI

```bash
az login
az account set --subscription "<your-subscription-name-or-id>"

# Create a resource group (skip if you have one)
az group create \
  --name rg-partner-library \
  --location westeurope

# Create a Log Analytics workspace
az monitor log-analytics workspace create \
  --resource-group rg-partner-library \
  --workspace-name law-partner-library \
  --location westeurope

# Create the workspace-based AppInsights resource
az monitor app-insights component create \
  --app appi-partner-library \
  --location westeurope \
  --resource-group rg-partner-library \
  --workspace law-partner-library \
  --kind web

# Get the connection string
az monitor app-insights component show \
  --app appi-partner-library \
  --resource-group rg-partner-library \
  --query connectionString -o tsv
```

### Wire it into the build

1. In your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `VITE_APPINSIGHTS_CONNECTION_STRING`. Value: the connection string from above.
3. Confirm your deploy workflow injects this into the build step (see the README "Optional: analytics" section).
4. Push a commit. The next deploy embeds the connection string into the static bundle.

---

## 2. Useful KQL queries

Run these in the **Logs** blade of your Application Insights resource.

### Daily page views, last 30 days

```kusto
pageViews
| where timestamp > ago(30d)
| summarize views = count() by bin(timestamp, 1d)
| order by timestamp asc
```

### Unique visitors, last 7 days

```kusto
pageViews
| where timestamp > ago(7d)
| summarize uniqueUsers = dcount(user_Id)
```

### Top pages, last 7 days

```kusto
pageViews
| where timestamp > ago(7d)
| summarize views = count() by name
| order by views desc
| take 20
```

### Top outbound links, last 7 days

```kusto
customEvents
| where timestamp > ago(7d)
| where name == 'OutboundLinkClick'
| extend host = tostring(customDimensions['host'])
| extend url = tostring(customDimensions['url'])
| summarize clicks = count() by url, host
| order by clicks desc
| take 20
```

### Visitor geography (rough)

```kusto
pageViews
| where timestamp > ago(30d)
| summarize views = count() by client_CountryOrRegion
| order by views desc
```

---

## 3. Weekly KPI email report (optional, sample only)

The included PowerShell scripts run on Windows and email an HTML summary via Outlook COM. They are **samples**. They depend on:

- Windows
- Outlook desktop (running)
- Azure CLI (`az`) signed in to a tenant with Reader access on your AppInsights resource

If you don't run on Windows or don't use Outlook, treat the scripts as a reference for the KQL queries and roll your own delivery.

### Setup

1. Edit `scripts/weekly-analytics-report.ps1.example`:
   - Update default `-AppName` to your AppInsights resource name
   - Update default `-ResourceGroup` to your resource group
   - Update default `-Subscription` to your subscription name or ID
   - Update default `-To` to your email address
   - Update `$siteUrl` near the top to your deployed SWA URL
2. Rename to remove the `.example` suffix:
   ```powershell
   Rename-Item scripts\weekly-analytics-report.ps1.example weekly-analytics-report.ps1
   ```
3. Test it manually with `-NoSend` first:
   ```powershell
   .\scripts\weekly-analytics-report.ps1 -NoSend
   ```
4. If that produces a valid HTML file in `outputs\`, run a real send:
   ```powershell
   .\scripts\weekly-analytics-report.ps1
   ```
5. Schedule it. The companion script does this for you:
   ```powershell
   Rename-Item scripts\register-weekly-report-task.ps1.example register-weekly-report-task.ps1
   .\scripts\register-weekly-report-task.ps1
   ```

This registers a Windows Task Scheduler entry that runs Mondays at 09:00 local. Modify the script if you want a different cadence.

### Operating notes

- The script depends on `az` auth being live. If your token has expired, it emails an error notice instead of metrics. You'll know to re-auth.
- Outlook must be running for the email send to succeed.
- Reports save to `outputs/` (gitignored). Useful for debugging when emails don't arrive.

---

## 4. Cost ballpark

For a small partner library with low traffic:

- **Azure Static Web Apps Free tier:** $0/month. Includes 100 GB bandwidth, custom domain, free SSL.
- **Application Insights:** ~$0–2/month. First 5 GB ingestion free, then ~$2.30/GB. A small site easily fits in free tier.
- **Log Analytics workspace:** included with workspace-based AppInsights at the same rate.

If you exceed the free tier, set a **daily cap** on Application Insights to avoid surprises (resource → "Usage and estimated costs" → "Daily cap").

---

## 5. Going to production checklist

Before pointing partners or stakeholders at the site:

- [ ] Custom domain configured (SWA → Custom domains → Add)
- [ ] HTTPS enforced (default on SWA, verify)
- [ ] Decide on access control (public, or follow `docs/auth/entra-gating.md`)
- [ ] Analytics provisioned and verified (run a KQL query, confirm events appear)
- [ ] Daily cap set on Application Insights
- [ ] Secrets reviewed: only `AZURE_STATIC_WEB_APPS_API_TOKEN_*` and (optionally) `VITE_APPINSIGHTS_CONNECTION_STRING` should exist in repo secrets
- [ ] Sample content from the template removed
- [ ] `LICENSE`, `SUPPORT.md`, `SECURITY.md` updated to reflect your project, not Johan's
- [ ] README rewritten for your audience
