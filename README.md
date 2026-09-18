# ScheduleX

Social media management for teams: compose once, publish to X, LinkedIn, Facebook, Instagram, TikTok and Pinterest, on a queue or a drag-and-drop calendar, with approvals, analytics and a shared inbox.

## Run it

```bash
npm install
cp .env.example .env      # then add credentials for the platforms you want (see below)
npm run dev               # web on http://localhost:3000, API on http://127.0.0.1:3001
```

Open http://localhost:3000. The first visit asks you to create the workspace; that account is the **owner**. Invite teammates from **Team** (invite links are single-use and expire after 7 days).

Always open the app at the address in `APP_URL` (default `http://localhost:3000`). Requests from any other origin are rejected.

### Production

```bash
npm run build && npm start   # one process serves the app and the API
```

Set `APP_URL` to your public **https** address and `HOST=0.0.0.0` only behind HTTPS. If a reverse proxy sits in front, set `TRUST_PROXY=1` (its hop count), otherwise every visitor looks like the proxy and login rate limiting can't tell them apart. Data lives in `server/data/` (back it up; keep it private).

## Connecting accounts

**For people using ScheduleX:** open **Accounts → Connect social account**, pick a platform (for LinkedIn, choose **Profile** or **Page**), and sign in in the window that opens. If the login has several Pages or boards, you choose which to add. No keys or settings are involved.

**For whoever runs ScheduleX (one time per platform):** each platform only lets a registered developer app sign users in. The first time an admin clicks a platform that isn't set up, ScheduleX opens a short guided setup: open the platform's developer portal, create the app, copy the redirect URL shown, paste the app's Client ID and secret, and click **Save & continue**. That goes straight into the platform's sign-in. Credentials are stored encrypted, are never shown again, and can be changed later from the ⚙ on the platform's tile. After that, everyone using your ScheduleX connects with a click. This is how Publer and Buffer work too; they just registered the apps themselves.

Environment variables (below) still work and take precedence over saved credentials, which suits deployments configured through the server environment.

| Platform | Env vars (optional if entered in the app) | Notes |
|---|---|---|
| X | `X_CLIENT_ID` (`X_CLIENT_SECRET` if confidential) | Free tier has a small monthly post limit. |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | Add "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect". Company **Pages** additionally need LinkedIn's Community Management API product (LinkedIn approves it). Tokens last ~60 days, then reconnect. No analytics API for personal profiles. |
| Facebook, Instagram | `META_APP_ID`, `META_APP_SECRET` | One login connects all your Pages and linked Instagram accounts. Needs Meta app review for other people's accounts. Instagram needs `PUBLIC_URL` (public https) and JPEG images. |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | https redirect required. Posts are private until TikTok audits your app. MP4 only. |
| Pinterest | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` | Each board is its own account. Trial apps: set `PINTEREST_API_BASE` to the sandbox. |

**Status:** the provider code follows each platform's documented API and is covered by tests that mock the network, but has not been exercised against the live APIs. Expect to fix small differences on first connect.

## LinkedIn: what the consent screen shows

LinkedIn (not ScheduleX) draws the "**<your app> would like to…**" screen. It shows your app's **name and logo** from the LinkedIn developer portal, the **permissions (scopes)** ScheduleX asks for, and "You will be redirected to" your `APP_URL`.

Creating the LinkedIn app: go to linkedin.com/developers → Create app → associate it with a LinkedIn **Company Page** (that Page's admin must verify the app) → set the name and logo → Products: add *Sign In with LinkedIn using OpenID Connect* and *Share on LinkedIn* → Auth: add the redirect URL shown in the connect dialog.

Out of the box ScheduleX asks only for what it uses: your name/photo and permission to post (Profile), plus the Pages you administer and permission to post as them (Page). Bigger apps such as Publer show a long list because LinkedIn approved them for analytics, comments and ads. If LinkedIn approves your app for more, add the scopes in `.env`:

| Consent-screen line | Scope | LinkedIn product needed | Used by ScheduleX today? |
|---|---|---|---|
| Use your name and photo | `profile` (`openid`) | Sign In with LinkedIn (OpenID) | Yes |
| Create posts on your behalf | `w_member_social` | Share on LinkedIn | Yes |
| Create posts on your Pages' behalf | `w_organization_social` | Community Management API | Yes |
| See which Pages you manage | `r_organization_admin` | Community Management API | Yes |
| Read your posts and their reporting data | `r_member_social` | restricted, by approval | No (requesting it is harmless but unused) |
| Read your Pages' posts, comments, reactions | `r_organization_social` | Community Management API | No |
| Read your Pages' follower data | `r_organization_followers` | Community Management API | No |
| Manage advertising accounts / reports | `rw_ads`, `r_ads_reporting` | Advertising API | No |

Scope names and product requirements are from LinkedIn's documentation as I know it; confirm them in your app's **Products** tab. Adding scopes only changes what LinkedIn shows and grants; ScheduleX doesn't yet read LinkedIn analytics or comments.

## Roles

| Role | Can |
|---|---|
| Viewer | Read everything |
| Contributor | Write drafts, submit posts for approval |
| Editor | Publish and schedule directly, approve or reject, inbox, categories, delete media |
| Admin | Connect accounts, set queue times, manage members (except other admins) |
| Owner | Everything, including admins |

The server enforces these; the UI just hides what you can't do.

## What's where

- `server/` – Express API, OAuth providers (`server/providers/`), scheduler, publisher, analytics, inbox. JSON storage in `server/data/`.
- `src/` – React app.

## Known limits

- Evergreen recycling: if a re-posted copy fails (X, for example, rejects duplicate text), the chain pauses until an editor retries it from Posts. "Stop recycling" (Categories) ends a whole chain.
- Queue times are stored as clock times and interpreted in each viewer's browser time zone, so team members in different zones should agree on one.
- One workspace per install. No per-account queues (one shared posting schedule).
- Video posting only works on TikTok; X, LinkedIn, Facebook and Pinterest post images.
- Inbox covers X, Facebook and Instagram only (other APIs don't allow it).
- "Suggested schedule" is generic weekday times, not derived from your audience.
- Storage is a single JSON file, fine for a small team, not for heavy concurrent use.
- OAuth tokens are encrypted at rest with a key stored beside the data (or `TOKEN_ENCRYPTION_KEY`), which protects a leaked data file but not a compromised server.
