# Getting started

This guide walks through the full first-run setup, from clone to deployed site. Plan on 15 minutes for the basic flow, longer if you turn on the optional features.

## Prerequisites

- Node.js 20 or 22 ([download](https://nodejs.org/))
- Git
- A GitHub account
- *(Optional)* An Azure subscription for hosting and analytics

## 1. Create your repository

On the [template repo page](https://github.com/), click **Use this template** → **Create a new repository**. Pick an owner, name your repo, set visibility (public or private), and create.

Then clone:

```bash
git clone https://github.com/<your-user>/<your-repo>.git
cd <your-repo>
```

## 2. Install dependencies and run locally

```bash
npm install
npm run docs:dev
```

Open `http://localhost:5173` in your browser. Edit any Markdown file in `docs/` and the page hot-reloads.

## 3. Customize content

Three things to edit first:

1. **`docs/.vitepress/config.ts`** — site title, navigation, sidebar, social links.
2. **`docs/index.md`** — the home page hero and feature blocks.
3. **`docs/resources.md`** — your curated list, grouped however makes sense.

Add new pages by creating a new `.md` file under `docs/` and linking to it from your sidebar config.

### Adding an entry

The pattern in `docs/resources.md` is one bullet per resource:

```markdown
- **[Resource name](https://example.com)** — one-line description of why it matters. *Type*
```

`*Type*` is optional — use it if you want to signal what kind of source it is (Blog, Whitepaper, Tool, Reference, etc.). For longer resources that need their own page, create a new file under `docs/` and link to it from `resources.md` or your sidebar.

## 4. Build for production

```bash
npm run docs:build
```

The static output lives at `docs/.vitepress/dist/`. You can preview it with:

```bash
npm run docs:preview
```

## 5. Deploy

The fastest path is `scripts\bootstrap.ps1` from the repo root — it provisions Azure resources, sets the GitHub secrets, and activates the deploy workflow in one go. See the [README](../) under "Deploy your site" for the command and prerequisites.

## 6. Optional: enable analytics

See the README under "Optional: analytics".

## 7. Optional: enable Entra gating

See [Entra gating](../auth/entra-gating).

## Troubleshooting

**`npm install` fails with EACCES or permission errors.**
Make sure you're not running as Administrator on Windows or root on Linux. Use a Node version manager like `nvm` or `fnm` for clean installs.

**`npm run docs:dev` says "port 5173 already in use".**
Change the port in `docs/.vitepress/config.ts` under `vite.server.port`, or kill the process holding the port.

**Site builds locally but the deployed version is blank.**
Check that your SWA workflow has `app_location: docs` and `output_location: docs/.vitepress/dist`. The Portal wizard sets these correctly. If you hand-authored the workflow, double-check.

**Analytics events don't appear in Application Insights.**
Confirm the GitHub secret `VITE_APPINSIGHTS_CONNECTION_STRING` is set, and confirm your deploy workflow injects it as an `env:` var on the build step. The connection string must be present at **build time**, not runtime.
