# A11yAgent

Next.js (App Router) workspace that scans public URLs with **axe-core** in **headless Chromium**, explains findings with **Gemini** ([Google AI Studio](https://aistudio.google.com/) free tier), **Claude** (Anthropic), or the **AssemblyAI LLM Gateway**, and includes a **Web Speech API** voice agent plus AI chat. LLM prompts use **TOON** ([Token-Oriented Object Notation](https://toonformat.dev) via [`@toon-format/toon`](https://www.npmjs.com/package/@toon-format/toon)) for structured payloads—scan finding lists, explain-issue rows, testing-hub analysis, manual-scenario input, **and the in-app chat system context** (scan rollup + focused issue)—instead of JSON where it saves tokens.

**Architecture:** For a detailed system overview, data flows, and Mermaid diagrams, see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Setup

```bash
npm install
cp .env.example .env.local
# Add GEMINI_API_KEY and/or ANTHROPIC_API_KEY and/or ASSEMBLYAI_API_KEY; optional PUPPETEER_EXECUTABLE_PATH for local scans
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev script is pinned to **port 3000** (`next dev -p 3000`) so the URL does not jump to 3001 when another process briefly holds the port—if you see “port in use,” stop the other listener and run `npm run dev` again.

## Cursor: accessibility MCP (optional)

This repo includes [`.cursor/mcp.json`](./.cursor/mcp.json) registering **[a11y-mcp-server](https://www.npmjs.com/package/a11y-mcp-server)** (axe-core + Puppeteer via the Model Context Protocol). In **Cursor**, reload the window or restart MCP so agents can call tools such as **`test_accessibility`** (URL scans), **`test_html_string`**, **`get_rules`**, **`check_color_contrast`**, **`check_aria_attributes`**, and **`check_orientation_lock`**.

This improves **AI-assisted development and review** (faster iteration when the agent can run checks itself). It does **not** replace or speed up the in-app `POST /api/scan` pipeline—the web app and MCP server are separate processes.

To run the server standalone (debugging): `npm run mcp:a11y`

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes (for AI, free tier) | [Google AI Studio](https://aistudio.google.com/apikey) API key. Use `LLM_PROVIDER=gemini` to prefer Gemini when you also have Anthropic. |
| `GEMINI_MODEL_DEFAULT` | No | Default `gemini-2.5-flash`. On **429 / quota**, the app retries with backoff, tries **fallback models** (`GEMINI_MODEL_FALLBACKS` or built-ins), then **Claude** if `ANTHROPIC_API_KEY` is set. See [Gemini models](https://ai.google.dev/gemini-api/docs/models). |
| `GEMINI_MODEL_CRITICAL` | No | Default `gemini-2.5-flash`. Override with e.g. `gemini-2.5-pro` if your quota allows. |
| `GEMINI_MODEL_FALLBACKS` | No | Comma-separated model ids tried after the primary when rate-limited (separate free-tier pools). |
| `GEMINI_429_ATTEMPTS_PER_MODEL` | No | Retries per model on 429 (default **4**), using server `retry in …s` when present. |
| `GEMINI_FALLBACK_TO_ANTHROPIC` | No | `false` to disable Claude fallback when `LLM_PROVIDER=gemini` and Gemini stays rate-limited. |
| `ANTHROPIC_API_KEY` | Alternative for AI | [Anthropic](https://console.anthropic.com/) API key. If set **and** `LLM_PROVIDER` is unset, Anthropic is chosen before Gemini (quality default). |
| `LLM_PROVIDER` | No | `gemini`, `anthropic`, or `assemblyai`. If unset: **Anthropic** → **Gemini** → **AssemblyAI** (first with a configured key). |
| `ANTHROPIC_MODEL_SONNET` | No | Default `claude-sonnet-4-5` (chat + non-critical explanations via Anthropic API) |
| `ANTHROPIC_MODEL_OPUS` | No | Default `claude-opus-4-6` (critical explanations via Anthropic API) |
| `ASSEMBLYAI_API_KEY` | Alternative for AI | [AssemblyAI](https://www.assemblyai.com/) key for LLM Gateway. On LeMUR/access errors, the app falls back to Anthropic or Gemini when those keys exist. |
| `ASSEMBLYAI_LLM_URL` | No | Default US: `https://llm-gateway.assemblyai.com/v1/chat/completions`. EU: `https://llm-gateway.eu.assemblyai.com/v1/chat/completions` |
| `ASSEMBLYAI_MODEL_DEFAULT` | No | Default `claude-sonnet-4-5-20250929` (AssemblyAI gateway) |
| `ASSEMBLYAI_MODEL_CRITICAL` | No | Default `claude-opus-4-6` (AssemblyAI gateway) |
| `PUPPETEER_EXECUTABLE_PATH` | Recommended locally | Path to Chrome/Chromium. On macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |

On **macOS/Windows**, scans use your **installed Chromium-based browser** (macOS: Chrome, Chrome Canary, Chromium, Brave, Arc, Edge under `/Applications/`, in that order; Windows: Chrome, Edge). `@sparticuz/chromium` is a **Linux** binary—using it locally caused `spawn ENOEXEC`. On **Linux/Vercel**, the bundled `@sparticuz/chromium` is used when `PUPPETEER_EXECUTABLE_PATH` is unset. Use a **Pro** plan (or similar) for reliable long-running functions, **60s** timeout, and enough **memory** for Chromium (see `vercel.json`).

## API

- `POST /api/scan` — `{ "url": "https://..." }` → axe violations normalized as issues.
- **Sign-in / gated pages:** **New scan** supports **Sign-in prep** (open/copy URL) and optional **cookie import** (JSON array, only with *Page may need a sign-in*) so **`POST /api/scan`** can run headless Chrome with `setCookie` before navigation. See **[ARCHITECTURE.md](./ARCHITECTURE.md)**.
- `POST /api/ai-explain` — `{ "issue": { ...ScanIssue } }` → `{ explanation, model }`.
- `POST /api/chat` — `{ "messages": [{role, content}], "scanSummary"?: {...} }` → `{ reply, model }`.
- `POST /api/ai-testing-analysis` — `{ scannedUrl, mode, issues[], priority?, outputFormat? }` → `{ analysis, model, mode, priority, outputFormat }`. `mode` is one of `pour`, `methods`, `checkpoints`, `comprehensive`, **`expert-audit`**. The `priority` (`aa` | `aa-aaa`) and `outputFormat` (`markdown` | `json` | `jira`) fields apply to **`expert-audit`**.
- `POST /api/testing-scenarios` — manual QA scenarios from the latest scan (used by the Testing Scenarios runner).
- `POST /api/jira-issue` — single Jira ticket from a finding (mock-mode when `JIRA_*` env vars are unset).
- `POST /api/jira-test-plan` — Jira test plan from selected manual scenarios.

## AI Testing Hub (`/testing`)

The dashboard at **`/testing`** turns axe results into AI-written reports. Each card runs the same scan pipeline and then a different analysis mode:

| Page | Mode | What it produces |
|------|------|------------------|
| `/testing/ai-report` | `comprehensive` | One integrated report mapped to WCAG / WebAIM / Quickref themes. |
| `/testing/pour` | `pour` | Findings grouped by Perceivable / Operable / Understandable / Robust. |
| `/testing/methods` | `methods` | Automation coverage + manual + user-research plan. |
| `/testing/checkpoints` | `checkpoints` | High-signal verification buckets with per-bucket findings. |
| `/testing/scenarios` | (`POST /api/testing-scenarios`) | Manual test cases, exportable as a Jira Test issue. |
| **`/testing/expert-audit`** | **`expert-audit`** | **Senior-QA / CPACC-style audit across WCAG 2.1 AA + 2.2 AA (1.1.1, 1.3.x, 1.4.x, 2.1.x, 2.4.x, 3.1.1, 3.2.x, 3.3.x, 4.1.x, plus 2.4.11, 2.5.3, 3.2.6, 3.3.7) with severity (CRITICAL / SERIOUS / MODERATE / MINOR), before/after fix snippets, technique IDs (H37, G18, ARIA6 …), and a choice of Markdown report, downloadable JSON, or Markdown + bulk Jira-ticket creation.** Toggle **Priority** (AA only / AA + AAA where feasible) and **Output format** in the runner. The Jira output reuses `/api/jira-issue` so it works in mock mode when Jira credentials are unset.

## Hydration / voice UI

`VoiceAssistant` is loaded with `next/dynamic({ ssr: false })` so the Web Speech API is never evaluated during SSR (avoids React hydration mismatches on the mic button). Do not render `VoiceAssistant` in a server-only path without that pattern.

## Voice troubleshooting

- **`network` error (Chrome):** Speech recognition uses an online service. Stay on Wi‑Fi/Ethernet, allow the microphone when prompted, and open the app at **`http://localhost:3000`** (or HTTPS). Using **`http://192.168.x.x:3000`** is not a secure context and often breaks voice.
- **Mic first:** The app requests the microphone with `getUserMedia` before starting recognition, which avoids many failures.
- **Fallback:** Use **“Or type the same commands”** if voice still fails (VPN, corporate firewall, etc.).

## Voice commands

- “Scan this page”
- “Explain issue 3”
- “Show critical issues”
- “How to fix this issue” (uses the selected issue)

## Security notes

The scan endpoint hardens against **SSRF** with an expanded blocklist (loopback, link-local, RFC1918, IPv6 loopback/link-local, AWS/GCP metadata IPs), **DNS rebinding** protection (`dns.promises.lookup()` re-validation against the resolved IP), scheme allowlist (`http:` / `https:` only), and a 2048-character URL cap — see [`lib/ssrf-guard.ts`](./lib/ssrf-guard.ts). All AI responses are HTML-sanitised via [`lib/sanitise.ts`](./lib/sanitise.ts) before they leave the server. Per-IP **sliding-window rate limiting** (Upstash Redis) gates `/api/scan` (10/h), `/api/ai-*` (50/h), and `/api/chat` (30/h); when Upstash env vars are unset (local dev) the limiter no-ops with a warning. Every POST API route validates its body with a Zod schema before doing any work — see the **Request validation** section below.

## Deploy a public URL (Vercel)

Anyone can use the app in a browser after you host it—no need for them to install Node or run localhost.

1. Push this repo to GitHub (already done if you use [this repository](https://github.com/shahronit/AI-Accessibility-Agent)).
2. Go to [vercel.com](https://vercel.com), sign in, and click **Add New… → Project**.
3. **Import** your GitHub repository. Framework Preset should detect **Next.js**; leave the default build command (`next build`) and output.
4. Under **Environment Variables**, add the same keys you use in `.env.local` (at minimum one LLM key such as `GEMINI_API_KEY`). Copy names and optional values from `.env.example`.
   - **Do not set `PUPPETEER_EXECUTABLE_PATH` on Vercel.** Production runs on Linux; the app uses [`@sparticuz/chromium`](https://github.com/Sparticuz/chromium) automatically when that variable is unset.
   - Add Jira variables only if you want live Jira from the deployed site.
5. Click **Deploy**. When it finishes, Vercel gives you a **free HTTPS URL** you can share—no domain registration required: `https://<project-name>.vercel.app`. If your Vercel **Project Name** is `a11yagent`, the hostname is usually **`https://a11yagent.vercel.app`** (Vercel uses lowercase). Confirm under **Project → Settings → Domains**.

### Free “domain” (no purchase)

- **Included subdomain:** On Vercel’s **free (Hobby)** plan you still get a working public site at **`https://your-name.vercel.app`**. That counts as a free address: visitors use it like any website; you do **not** need to buy `something.com` unless you want to.
- **Nicer free URL:** In Vercel go to **Project → Settings → General** and change **Project Name**. Your URL becomes `https://<that-name>.vercel.app` (must be unique on Vercel). Redeploy if prompted.
- **Custom domain (optional, often paid):** Buying `example.com` from a registrar is separate. If you already have **any** domain (including free subdomains from a school, employer, or some DNS providers), add it under **Project → Settings → Domains** and set the DNS records Vercel shows. This app does not require a custom domain to be shared publicly.

6. Optional: **Project → Settings → Domains** to attach a custom domain you already own.

**Plans:** Headless scans need a **large function** (`vercel.json` sets **3008 MB** RAM and **60s** for `/api/scan`). On Vercel, that typically requires a **Pro** (or higher) team—free/hobby limits may be too small or too short and scans can time out. Long AI routes (`/api/chat`, `/api/ai-explain`, `/api/ai-testing-analysis`, `/api/testing-scenarios`) are configured for up to **120s** and may also need a paid tier. If a deploy fails or scans abort early, upgrade the project or reduce scan scope in code.

**Security:** A public scanner can be abused (SSRF, cost). Before sharing widely, consider adding **authentication**, **rate limiting**, and monitoring. See the Security notes below.

## Other hosts (free subdomain, no domain purchase)

Each provider below gives you a **free HTTPS hostname** (you only pay if you attach a custom domain from a registrar). Pick based on budget and whether **axe scans** must run on the free tier.

| Platform | Typical free URL | Good fit for this repo? |
|----------|------------------|-------------------------|
| **[Vercel](https://vercel.com)** | `https://*.vercel.app` | **Best default** — repo already has `vercel.json`. Scans use serverless Chromium. Heavy RAM/time may need **Pro**. |
| **[Render](https://render.com)** | `https://*.onrender.com` | **Strong** — use the **`Dockerfile`** in this repo (system Chromium + `PUPPETEER_EXECUTABLE_PATH`). Free web services **spin down** when idle (first request after sleep is slow). Optional [`render.yaml`](./render.yaml) blueprint. |
| **[Fly.io](https://fly.io)** | `https://*.fly.dev` | **Strong** — deploy the same Docker image; check current **free tier / limits** (often requires a card on file). Run `fly launch` from the repo root after installing the [CLI](https://fly.io/docs/hands-on/install-flyctl/). |
| **[Railway](https://railway.app)** | `https://*.up.railway.app` | **Possible** — deploy from GitHub with **Dockerfile**; pricing is mostly **usage-based** (trial credits). |
| **[Netlify](https://netlify.com)** | `https://*.netlify.app` | **UI + simple APIs** are fine; **full Puppeteer scans** are not drop-in — expect extra work vs Vercel/Docker. |
| **Cloudflare Pages** | `https://*.pages.dev` | **Not a simple port** — Workers runtime differs from Node + Chromium as used here. |

### Deploy on Render (Docker + free `onrender.com` URL)

1. Push this repo to GitHub.
2. [Render](https://dashboard.render.com) → **New +** → **Blueprint** → point at this repo's [`render.yaml`](./render.yaml). Render reads the file and provisions the service with the right runtime, port, and `healthCheckPath`.
3. After the first deploy, fill in the `sync: false` secrets in **Service → Environment**:

   | Variable | Required? | What it unlocks |
   | --- | --- | --- |
   | `NEXTAUTH_URL` | **Yes** | Public URL Render assigns (e.g. `https://a11yagent.onrender.com`). NextAuth + GitHub OAuth callbacks resolve against this. |
   | `GITHUB_ID`, `GITHUB_SECRET` | **Yes** | Create a GitHub OAuth app pointing at `${NEXTAUTH_URL}/api/auth/callback/github`. |
   | `ANTHROPIC_API_KEY` and/or `GEMINI_API_KEY` and/or `ASSEMBLYAI_API_KEY` | **At least one** | Powers `/api/ai-*` and `/api/chat`. |
   | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional but recommended | Enables per-IP rate limiting (Fix 2), 10-min scan cache (Fix 6), and the `/history` + `/report/[scanId]` dashboard (Fix 7). When unset, all three degrade gracefully. |
   | `IBM_CHECKER_ENABLED` | Optional (default `true`) | Set to `"false"` to skip the IBM Equal Access pass and shave ~3–5s per scan. |
   | `A11Y_CI_TOKEN` | Optional | Only set if you point the GitHub Actions workflow (Fix 8) at the deployed Render URL instead of a CI-local server. Generate with `openssl rand -hex 32`. |

   `NEXTAUTH_SECRET` is auto-generated by Render the first time the service is created. `DB_PATH` defaults to `/app/data/a11yagent.db` for the SQLite multi-page scan store; the **free** plan has no persistent disk so the DB resets on every cold start — add a `disks:` entry in `render.yaml` on a paid plan if you need history.
4. Open the **`https://<service-name>.onrender.com`** URL Render assigns and sign in with GitHub.

### Deploy on Fly.io (Docker + free `fly.dev` URL)

1. Install `flyctl` and run `fly auth login`.
2. From the project root: `fly launch` — choose **Dockerfile** when prompted.
3. Set secrets — at minimum the auth + AI vars:

   ```bash
   fly secrets set \
     NEXTAUTH_SECRET="$(openssl rand -base64 32)" \
     NEXTAUTH_URL=https://<your-app>.fly.dev \
     GITHUB_ID=... GITHUB_SECRET=... \
     ANTHROPIC_API_KEY=...                  # or GEMINI_API_KEY
   # Optional but recommended:
   fly secrets set \
     UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=...
   ```
4. `fly deploy` — use the **`*.fly.dev`** URL shown in the dashboard.

### Local Docker check (optional)

```bash
docker build -t a11yagent .

docker run --rm -p 3000:3000 \
  -e NEXTAUTH_SECRET="$(openssl rand -base64 32)" \
  -e NEXTAUTH_URL=http://localhost:3000 \
  -e GITHUB_ID=... -e GITHUB_SECRET=... \
  -e ANTHROPIC_API_KEY=...   `# or GEMINI_API_KEY` \
  a11yagent
```

Then open `http://localhost:3000`. Add `-e UPSTASH_REDIS_REST_URL=... -e UPSTASH_REDIS_REST_TOKEN=...` to exercise the rate limiter, scan cache, and `/history` dashboard locally; otherwise those features no-op cleanly. The image's `HEALTHCHECK` polls `/` every 30s.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — production server
- `npm run lint` — ESLint

## CI / CD — accessibility gate on every PR

`.github/workflows/a11y-check.yml` runs on every pull request (`opened`,
`synchronize`, `reopened`):

1. **`build` job** — `npm ci`, `npm run lint`, `npm run build`.
2. **`a11y-scan` job** — boots `npm run start`, waits for `http://localhost:3000`
   to respond, then runs `node scripts/ci-scan.mjs`. The script POSTs each URL
   in [`.a11y-urls.json`](./.a11y-urls.json) to `/api/scan`, aggregates results,
   writes a Markdown table to the GitHub step summary, and on failure posts a
   PR comment via `actions/github-script`.

**The PR fails only when at least one finding has `impact === "critical"`.**
SERIOUS, MODERATE, and MINOR violations are reported but never gate the build,
so contributors can land non-critical fixes incrementally.

### One-time setup

In your repo settings → **Secrets and variables → Actions → New repository
secret**, add:

| Secret | Required? | What it does |
| --- | --- | --- |
| `A11Y_CI_TOKEN` | **Yes** | Opaque shared secret. The workflow sends it as `X-A11y-CI-Token`; `middleware.ts` admits the request when it matches `process.env.A11Y_CI_TOKEN` on the server. Generate with e.g. `openssl rand -hex 32`. |
| `NEXTAUTH_SECRET` | **Yes** | NextAuth requires a non-empty value at boot, even though no OAuth flow runs in CI. |
| `ANTHROPIC_API_KEY` | Optional | Only needed if a scanned page calls AI endpoints during render. |
| `GEMINI_API_KEY` | Optional | Same as above (fallback provider). |

The workflow does **not** require Upstash, GitHub OAuth, or IBM Equal Access
credentials — rate limiting and IBM checking degrade gracefully when their env
vars are missing.

### Customising the URL list

Edit [`.a11y-urls.json`](./.a11y-urls.json):

```json
{
  "urls": [
    "http://localhost:3000",
    "http://localhost:3000/signin",
    "http://localhost:3000/your-public-page"
  ]
}
```

To override the list at runtime (e.g. matrix scans against staging),
set `A11Y_SCAN_URLS` to a JSON array, or `A11Y_BASE_URL` to a different
host.

### What triggers a PR failure

`scripts/ci-scan.mjs` exits `1` (which fails the workflow and posts the
PR comment) when **any scanned URL returns at least one issue with
`impact === "critical"`**. Network errors and HTTP 5xx responses are
surfaced in the summary table but reported as warnings — they do not by
themselves fail the build, so a flaky deploy preview cannot block
merges.

## Request validation

Every POST API route under `app/api/*` validates its request body with a
[Zod](https://zod.dev) schema before doing any work. The schemas live in
[`lib/schemas.ts`](./lib/schemas.ts) and are wired in via the
[`validateRequest`](./lib/validate-request.ts) helper, so every route follows
the same flow:

```ts
const parsed = await validateRequest(req, ScanRequestSchema);
if (!parsed.ok) return parsed.error;
const body = parsed.data; // fully typed
```

A schema mismatch (or unparsable JSON) returns:

```json
{
  "error": "Invalid request",
  "details": { "formErrors": [], "fieldErrors": { "url": ["Required"] } }
}
```

with HTTP **400**, before any Chromium launch, KV lookup, or LLM call.
TypeScript `strict` mode is enabled in `tsconfig.json` and enforced by
both `npm run lint` and the CI build.
