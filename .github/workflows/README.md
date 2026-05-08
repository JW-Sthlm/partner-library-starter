# Workflows

This directory ships every workflow as `.example` so nothing fires until you opt in. Rename the file (drop the `.example` suffix), commit, and push to activate.

The deploy workflow is activated automatically by `scripts/bootstrap.ps1`. The agentic workflows are opt-in — leave them off until you want them.

## Always-on (after bootstrap)

| File | What it does | Triggers |
|---|---|---|
| `azure-static-web-apps.yml.example` | Builds VitePress and deploys to Azure Static Web Apps. Injects `VITE_APPINSIGHTS_CONNECTION_STRING` so analytics works. | Push to `main`; PR open / sync / close |

## Hygiene (recommended on)

| File | What it does | Triggers |
|---|---|---|
| `pr-validation.yml.example` | Runs `validate-metadata.ts`, builds the site, and checks external links on every PR. Fails the PR if anything's broken. | PR against `main` |
| `daily-link-check.yml.example` | Daily lychee scan for broken external links. Opens an issue if any are found. | `cron 06:00 UTC`; manual |

## The agentic loop

Four workflows that turn the library into a self-maintaining feed: discovery → triage → review → merge. All require **GitHub Models access** (`models: read` permission, free for public repos via the `GITHUB_TOKEN`). Activate together, in this order:

| File | What it does | Triggers |
|---|---|---|
| `research-agent.yml.example` | Runs `scripts/research-agent.ts` daily. Reads `sources.yml`, scores new items with Claude Sonnet 4.6 via GitHub Models, opens an issue for each promising one. | `cron 06:00 UTC`; manual |
| `auto-triage.yml.example` | Posts a friendly review comment on every link-suggestion issue with two big CTAs and adds track labels. | Issue opened with `link-suggestion` label |
| `auto-merge-smart-review.yml.example` | Auto-approves and squash-merges PRs from the smart-review agent. | PR opened by `Copilot[bot]` |
| `deploy-notify.yml.example` | After a successful deploy, posts the live page URL on the merged PR and the linked issue. Needs the `SITE_URL` repo variable. | Successful run of the deploy workflow |

## Maintenance

| File | What it does | Triggers |
|---|---|---|
| `maintenance-agent.yml.example` | Runs `scripts/maintenance-agent.ts` weekly. Checks link health, freshness, duplicates, and source reachability. Opens one report issue. | `cron 07:00 UTC Monday`; manual |

## Fallback

| File | What it does | Triggers |
|---|---|---|
| `auto-approve.yml.example` | Fallback path: if a reviewer just closes a link-suggestion issue without assigning Copilot, this workflow extracts the form fields and creates a PR mechanically. | Issue closed with `link-suggestion` label |

## Activation summary

The minimum to get a site live is `azure-static-web-apps.yml` (handled by bootstrap). Everything else is opt-in. A reasonable progression:

1. **Day 1.** Bootstrap → site live with analytics.
2. **Week 1.** Activate `pr-validation.yml` and `daily-link-check.yml` for hygiene.
3. **Week 2+.** When you have curated content patterns and a small reviewer pool, activate the agentic loop one workflow at a time.

## Required secrets and variables

| Name | Type | Set by | Used by |
|---|---|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | secret | bootstrap | deploy |
| `VITE_APPINSIGHTS_CONNECTION_STRING` | secret | bootstrap (optional) | deploy |
| `SITE_URL` | variable | manual: `gh variable set SITE_URL --body "https://..."` | auto-approve, deploy-notify |
| `GITHUB_TOKEN` | auto | GitHub | every workflow (granted scope-by-scope in each `permissions:` block) |

GitHub Models access uses the `GITHUB_TOKEN` with `models: read` permission. No separate secret needed for public repos. Private repos may require enabling Models for the org first — see [GitHub Models docs](https://docs.github.com/github-models).

## Customizing

Two starting points:

- **`docs/.vitepress/data/tags.ts`** is the source of truth for valid tag values. Tag-related logic in `auto-triage.yml`, `auto-approve.yml`, the agent prompts, and the validation script all reference this schema.
- **`auto-approve.yml`** has a `categoryMap` that routes the issue form's "Suggested Category" dropdown to a file path under `/docs`. Keep it in sync with what's in `docs/` and what's in the issue template `.github/ISSUE_TEMPLATE/link-suggestion.yml`.
