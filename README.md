# AI Accessibility Agent

Next.js (App Router) workspace that scans public URLs with **axe-core** in **headless Chromium**, explains findings with **Gemini** ([Google AI Studio](https://aistudio.google.com/) free tier), **Claude** (Anthropic), or the **AssemblyAI LLM Gateway**, and includes a **Web Speech API** voice agent plus AI chat.

## Setup

```bash
npm install
cp .env.example .env.local
# Add GEMINI_API_KEY and/or ANTHROPIC_API_KEY and/or ASSEMBLYAI_API_KEY; optional PUPPETEER_EXECUTABLE_PATH for local scans
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev script is pinned to **port 3000** (`next dev -p 3000`) so the URL does not jump to 3001 when another process briefly holds the port—if you see “port in use,” stop the other listener and run `npm run dev` again.

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
- `POST /api/ai-explain` — `{ "issue": { ...ScanIssue } }` → `{ explanation, model }`.
- `POST /api/chat` — `{ "messages": [{role, content}], "scanSummary"?: {...} }` → `{ reply, model }`.

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

The scan endpoint applies basic **SSRF** checks (scheme, blocked hostnames, private IPv4). Running a public URL scanner still carries abuse risk—add **auth**, **rate limits**, and monitoring before wide deployment.

## Deploy a public URL (Vercel)

Anyone can use the app in a browser after you host it—no need for them to install Node or run localhost.

1. Push this repo to GitHub (already done if you use [AI-Accessibility-Agent](https://github.com/shahronit/AI-Accessibility-Agent)).
2. Go to [vercel.com](https://vercel.com), sign in, and click **Add New… → Project**.
3. **Import** your GitHub repository. Framework Preset should detect **Next.js**; leave the default build command (`next build`) and output.
4. Under **Environment Variables**, add the same keys you use in `.env.local` (at minimum one LLM key such as `GEMINI_API_KEY`). Copy names and optional values from `.env.example`.
   - **Do not set `PUPPETEER_EXECUTABLE_PATH` on Vercel.** Production runs on Linux; the app uses [`@sparticuz/chromium`](https://github.com/Sparticuz/chromium) automatically when that variable is unset.
   - Add Jira variables only if you want live Jira from the deployed site.
5. Click **Deploy**. When it finishes, Vercel gives you a **free HTTPS URL** you can share—no domain registration required: `https://<project-name>.vercel.app`. For this repo, if the Vercel **Project Name** is `AI-Accessibility-Agent`, the hostname is usually **`https://ai-accessibility-agent.vercel.app`** (Vercel uses lowercase). Confirm under **Project → Settings → Domains**.

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
2. [Render](https://dashboard.render.com) → **New +** → **Web Service** → connect the repo.
3. Set **Runtime** to **Docker** (or use **Blueprint** and point at [`render.yaml`](./render.yaml)).
4. **Environment** → add the same variables as `.env.example` (e.g. `GEMINI_API_KEY`). **Set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`** only if you change the image; the `Dockerfile` already sets it.
5. Deploy; open the **`https://<service-name>.onrender.com`** URL Render assigns.

### Deploy on Fly.io (Docker + free `fly.dev` URL)

1. Install `flyctl` and run `fly auth login`.
2. From the project root: `fly launch` — choose **Dockerfile** when prompted.
3. Set secrets: `fly secrets set GEMINI_API_KEY=...` (and any others from `.env.example`).
4. `fly deploy` — use the **`*.fly.dev`** URL shown in the dashboard.

### Local Docker check (optional)

```bash
docker build -t ai-accessibility-agent .
docker run --rm -p 3000:3000 -e GEMINI_API_KEY=your_key_here ai-accessibility-agent
```

Then open `http://localhost:3000`.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — production server
- `npm run lint` — ESLint
