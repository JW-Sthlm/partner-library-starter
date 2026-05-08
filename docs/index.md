---
layout: home

hero:
  name: "Partner Library"
  text: "Curated knowledge for your partner ecosystem"
  tagline: "A starter site you can fork, rebrand, and ship in an afternoon."
  actions:
    - theme: brand
      text: Browse resources
      link: /resources
    - theme: alt
      text: Getting started guide
      link: /guides/getting-started

features:
  - title: Markdown-driven
    details: All content is Markdown files in git. No CMS, no database, no surprises.
  - title: Static and fast
    details: Built with VitePress. Deploys to Azure Static Web Apps free tier in minutes.
  - title: Optional analytics
    details: Drop in an Application Insights connection string and track page views, unique visitors, and outbound link clicks. Skip it and the site works fine without.
  - title: Optional gating
    details: Default is public. Switch on Entra ID gating when you need access control.
---

## What is this?

A small, opinionated starter for building a Markdown-driven knowledge site for a partner ecosystem, internal team, or community of practice. It is not a CMS. It is not a SaaS. It is a static site that lives in git.

You're looking at the default home page. Replace it with your own when you fork.

## How to use this template

1. Click **Use this template** on the GitHub repo.
2. Clone your new repo locally.
3. Run `npm install` then `npm run docs:dev`.
4. Edit the Markdown files in `docs/`. Push to deploy.

See the [Getting started guide](/guides/getting-started) for the full setup.
