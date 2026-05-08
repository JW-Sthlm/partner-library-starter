# Gate access with Entra ID

The default site is public. Anyone with the URL can read every page.

If you want to require sign-in (with Entra ID, formerly Azure AD), follow this guide. It is more work than a file rename. Plan on 30 to 60 minutes.

> This guide assumes you've already deployed the site as a Static Web App on Azure. If you haven't, do that first.

## What you'll set up

1. An Entra app registration that represents your site as a confidential client.
2. A redirect URI pointing at the SWA's auth endpoint.
3. SWA application settings holding the client ID and client secret.
4. A `staticwebapp.config.json` that requires authentication.

## Step 1: Create the Entra app registration

1. In the [Azure Portal](https://portal.azure.com), search **App registrations** → **+ New registration**.
2. Name it something recognizable, e.g. "Partner Library (production)".
3. **Supported account types:** pick what makes sense for your audience. Single tenant is the most common starting point.
4. **Redirect URI:** select **Web** and enter `https://<your-swa-hostname>.azurestaticapps.net/.auth/login/aad/callback`.
5. Click **Register**.
6. On the new app's overview page, copy:
   - **Application (client) ID**
   - **Directory (tenant) ID**

## Step 2: Create a client secret

1. In the app registration, go to **Certificates & secrets** → **+ New client secret**.
2. Description: "SWA auth", expiry: pick per your org's policy (typically 12 or 24 months).
3. **Copy the secret VALUE immediately.** Azure won't show it again.

## Step 3: Add the secrets to your Static Web App

1. In the Portal, go to your **Static Web App** resource.
2. **Configuration** → **Application settings** → **+ Add**.
3. Add two settings:
   - Name: `AAD_CLIENT_ID`, Value: *(the Application (client) ID from step 1)*
   - Name: `AAD_CLIENT_SECRET`, Value: *(the secret value from step 2)*
4. **Save**.

## Step 4: Replace the public config with the gated config

In your repo, replace `staticwebapp.config.json` with the contents of `staticwebapp.config.entra.example.json`, then edit:

- Replace `<YOUR_TENANT_ID>` with your **Directory (tenant) ID** from step 1.

Easiest:

```bash
# from your repo root
cp staticwebapp.config.entra.example.json staticwebapp.config.json
# then open staticwebapp.config.json and replace <YOUR_TENANT_ID>
```

Commit and push. The SWA workflow will redeploy.

## Step 5: Test

1. Open your site in a private/incognito window.
2. You should be redirected to `login.microsoftonline.com`.
3. Sign in with an account from the tenant.
4. You should land back on your site, signed in.

## Common pitfalls

**"AADSTS50011: The redirect URI specified in the request does not match"**
The redirect URI in your app registration must exactly match `https://<hostname>/.auth/login/aad/callback`. Custom domains need their own redirect URI added.

**"unauthorized_client" or generic 401 after login**
Confirm `AAD_CLIENT_ID` and `AAD_CLIENT_SECRET` are set in the SWA application settings (not in your build env vars). They are runtime, not build-time.

**Everyone in the tenant can sign in, but I want to restrict further**
SWA built-in auth doesn't natively support per-user authorization beyond `authenticated`. Two common options: use the app registration's "Assignment required" toggle plus an enterprise app assigned to a security group, or implement custom roles via the SWA `rolesSource` API.

**I want guests / multi-tenant access**
Change the app registration's supported account types and the `openIdIssuer` in `staticwebapp.config.json` to use `/common/v2.0` or your specific configuration. Read the [SWA auth docs](https://learn.microsoft.com/azure/static-web-apps/authentication-custom) carefully before you do this.

## Going back to public

To revert: replace `staticwebapp.config.json` with the original anonymous-default config (a clean copy lives in git history, or rewrite it as):

```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/*.ico", "/*.svg", "/*.png", "/*.jpg", "/*.webp"]
  },
  "routes": [
    { "route": "/*", "allowedRoles": ["anonymous"] }
  ]
}
```

Push, redeploy, done. You can leave the Entra app registration in place for next time.
