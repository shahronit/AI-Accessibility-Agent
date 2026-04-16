# A11yAgent — Architecture

This document describes how the application is structured, how data flows, and which external systems it depends on. It is aimed at developers onboarding to the codebase or planning deployments.

---

## 1. Summary

**A11yAgent** is a **Next.js 16 (App Router)** application. The **browser** runs a React UI with client-side state for the current scan. **Server Route Handlers** (`app/api/*/route.ts`) perform heavy work: headless **Chromium** loads target URLs, **axe-core** collects accessibility violations, and **LLM APIs** produce explanations, chat, and testing-hub reports. Optional **Jira Cloud REST** integration creates issues from the UI.

**Persistence on the device:** scan history and user display settings live in **`localStorage`** (not a central database). **Secrets** (API keys) live in **environment variables** on the server (e.g. `.env.local` locally, Vercel/Render env in production).

---

## 2. High-level system diagram

```mermaid
flowchart TB
  subgraph Browser["User browser (client)"]
    UI[React pages and components]
    CTX[ScanSessionProvider]
    LS[(localStorage: history, settings)]
    Voice[Web Speech API]
    UI <--> CTX
    UI <--> LS
    UI <--> Voice
  end

  subgraph Next["Next.js server"]
    API[API Route Handlers]
    ScanMod[lib: axeScanner, browserLaunch, url]
    AIMod[lib: aiClient, prompts, …]
    JiraMod[lib: jiraAdf, jiraBugTitle, …]
    API --> ScanMod
    API --> AIMod
    API --> JiraMod
  end

  subgraph Runtime["Headless browser (per scan request)"]
    Chr[Chromium / Chrome]
    Axe[axe-core]
    Chr --> Axe
  end

  subgraph External["External services"]
    Gemini[Google Gemini]
    Anthropic[Anthropic API]
    Assembly[AssemblyAI LLM Gateway]
    Jira[Jira Cloud REST]
  end

  UI -->|fetch JSON| API
  API -->|Puppeteer| Chr
  AIMod --> Gemini
  AIMod --> Anthropic
  AIMod --> Assembly
  JiraMod --> Jira
```

---

## 3. Application layers

```mermaid
flowchart LR
  subgraph AppRouter["App Router"]
    Root[app/layout.tsx + globals]
    AppGrp["app/(app)/layout → AppShell"]
    Pages["Pages: /, /scan, /history, /settings, /testing/*"]
    Root --> AppGrp --> Pages
  end

  subgraph Providers["Client providers"]
    P[app/providers.tsx]
    SSP[ScanSessionProvider]
    P --> SSP
  end

  subgraph API["API routes (Node runtime)"]
    R1["/api/scan"]
    R2["/api/ai-explain"]
    R3["/api/chat"]
    R4["/api/ai-testing-analysis"]
    R5["/api/testing-scenarios"]
    R6["/api/jira-issue"]
    R7["/api/jira-test-plan"]
  end

  Pages --> Providers
  Pages --> API
```

| Layer | Responsibility |
|--------|----------------|
| **Root layout** | Fonts, metadata, dark theme shell, wraps `Providers`. |
| **`(app)` layout** | `AppShell`: sidebar, nav, profile strip, Suspense fallback. |
| **Pages** | Route-specific UI; most interactive pages are `"use client"`. |
| **`Providers`** | Applies reduced-motion from settings; provides **scan session** (URL + issues + scan-in-progress flags). |
| **API routes** | Stateless request handlers; read `process.env`; return JSON. |

---

## 4. Scan pipeline (core flow)

```mermaid
sequenceDiagram
  participant U as User
  participant P as ScanWorkspacePage
  participant API as POST /api/scan
  participant B as Chromium + Puppeteer
  participant A as axe-core

  U->>P: Start scan (URL, WCAG preset, options)
  P->>API: JSON body (url, wcagPreset, deepScan, …)
  API->>API: validateScanUrl (SSRF-style checks)
  API->>B: launch browser (local Chrome or Sparticuz on Linux)
  B->>B: goto(url), optional Tab loop (deep scan)
  B->>A: inject axe, run with WCAG tags
  A-->>API: violations (+ optional passes/incomplete)
  API->>API: normalize → ScanIssue[]
  API-->>P: issues, scannedUrl
  P->>P: setScanResults, saveScanToHistory (localStorage)
```

**Important files**

- `app/api/scan/route.ts` — orchestrates Puppeteer, axe, timeouts (`maxDuration`).
- `lib/browserLaunch.ts` — **macOS/Windows:** installed Chrome/Edge; **Linux/Vercel:** `@sparticuz/chromium` when `PUPPETEER_EXECUTABLE_PATH` is unset.
- `lib/axeScanner.ts` — normalizes axe output into app **`ScanIssue`** shape.
- `lib/url.ts` — URL validation for scans.
- `lib/wcagAxeTags.ts` — maps WCAG preset → axe tags.
- `lib/scanCookies.ts` — validates optional **`cookies`** JSON for **`POST /api/scan`** (domain must match scan host; size caps).

### Sign-in workflow (UI) and authenticated scan

- **Sign-in prep (UI):** In **`components/NewScanLayout.tsx`**, **Page may need a sign-in** shows **Sign-in prep** when the URL validates: open/copy URL, optional **Import session cookies** (`<details>` + JSON textarea), then **Start scan**.
- **Cookie import (API):** **`POST /api/scan`** accepts **`cookies`** (JSON array) only when **`requiresLogin`** is true. **`app/api/scan/route.ts`** calls **`page.setCookie`** before **`page.goto`**. Response **`meta.cookiesApplied`** counts applied rows; **`meta.requiresLoginNote`** reflects whether cookies were used. Cookies are not persisted.

---

## 5. AI and chat flows

```mermaid
flowchart LR
  subgraph Entry["Client entry points"]
    E1[Explain tab /api/ai-explain]
    E2[ChatPanel /api/chat]
    E3[Testing hub /api/ai-testing-analysis]
    E4[Scenarios /api/testing-scenarios]
  end

  subgraph Core["lib/aiClient.ts"]
    R[resolvedLlmProvider]
    G[Gemini]
    AN[Anthropic]
    AS[AssemblyAI gateway]
    R --> G
    R --> AN
    R --> AS
  end

  subgraph Prompts["Prompt builders"]
    PR[prompts.ts]
    TA[testingAnalysisPrompts.ts]
    TS[testingScenariosPrompt.ts]
    TN[toonEncode.ts]
    TA --> TN
    PR --> TN
    TS --> TN
  end

  E1 --> Core
  E2 --> Core
  E3 --> Core
  E4 --> Core
  Core --> Prompts
```

- **`lib/aiClient.ts`** centralizes provider selection (`LLM_PROVIDER` or key precedence), retries (e.g. Gemini 429), and fallbacks between providers.
- **`lib/prompts.ts`** — explain + chat system/user prompts.
- **`lib/toonEncode.ts`** — encodes structured scan/issue payloads as **TOON** ([`@toon-format/toon`](https://www.npmjs.com/package/@toon-format/toon)) for fewer tokens than JSON in LLM requests (testing reports, explain, manual scenarios, and **`buildChatSystemPrompt`** scan summary + focused issue).
- **`lib/issueSanitize.ts`** / **`sanitizeIssueForApi`** (re-exported from `clientApi.ts`) trim payloads sent to APIs.

---

## 6. Jira integration

```mermaid
flowchart LR
  IC[IssueCard / Scan workspace] --> JI[POST /api/jira-issue]
  TS[TestingScenariosClient] --> JT[POST /api/jira-test-plan]
  JI --> ADF[lib/jiraAdf.ts]
  JT --> TP[lib/jiraTestPlanDescription.ts]
  ADF --> REST[Jira REST API]
  TP --> REST
```

Environment variables (see `.env.example`) configure host, project, issue types, and optional ADF/custom fields.

---

## 7. Client-side storage (no backend DB)

| Key / module | Data |
|--------------|------|
| `lib/scanHistory.ts` | Saved scans: URL, counts, `byImpact`, optional samples. |
| `lib/userSettings.ts` | Display name, email (cosmetic), reduced motion. |
| `lib/explainWindowTransfer.ts` | Short-lived handoff to `/scan/explain` (sessionStorage pattern). |

The **dashboard** reads history via `loadScanHistory()` after mount so server-rendered HTML does not depend on private browser data.

---

## 8. Deployment shapes

```mermaid
flowchart TB
  subgraph Vercel["Vercel (serverless)"]
    VFn[Serverless functions]
    VCh[Sparticuz Chromium]
    VFn --> VCh
  end

  subgraph Docker["Docker (e.g. Render / Fly)"]
    DApp[next start in container]
    DChr[System Chromium package]
    DApp --> DChr
  end

  UI2[Browser] --> Vercel
  UI2 --> Docker
```

- **Vercel:** `vercel.json` configures memory/duration for scan and long AI routes; no `PUPPETEER_EXECUTABLE_PATH` needed on Linux.
- **Docker:** `Dockerfile` installs Chromium and sets `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.

---

## 9. Security and operations (short)

- **Scan URL** validation reduces naive SSRF; a public scanner still needs **rate limits**, **auth**, and monitoring for production abuse.
- **API keys** never ship to the client for server routes; only public env vars exposed via `NEXT_PUBLIC_*` would be (this project minimizes those).
- **Voice** uses the browser **Web Speech API** (Google’s recognition in Chrome); requires HTTPS or localhost for a secure context.

---

## 10. Key directory map

| Path | Role |
|------|------|
| `app/(app)/` | Authenticated-style app shell routes (dashboard, scan, history, settings). |
| `app/testing/` | AI testing hub marketing/runner pages. |
| `app/api/` | REST-like JSON endpoints for scan, AI, Jira. |
| `components/` | UI: shell, scan workspace, lists, voice, chat, testing runners. |
| `lib/` | Domain logic: axe, AI, Jira, exports, voice commands, WCAG tags. |
| `hooks/` | `useDebouncedValue`, `useLiveSpeechRecognition`. |

---

## 11. Diagram source

Diagrams use **[Mermaid](https://mermaid.js.org/)**. They render on GitHub when viewing this file; in VS Code / Cursor, use a Mermaid preview extension if needed.

For a single-page **runtime view** (what runs where on one request), combine sections **2**, **4**, and **5**: browser calls **`/api/scan`** → Chromium + axe → JSON issues → optional **`/api/ai-explain`** or **`/api/chat`** with **`lib/aiClient`**.
