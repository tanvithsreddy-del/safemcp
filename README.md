# safemcp.info — frontend

The largest free directory of Model Context Protocol servers.
28,577 verified servers, individually categorized and scored.

## What this is

Astro static site, dark mode default, no backend, no tracking.
Reads from `data/state.db` (your mcp-scanner-pro DB) at build time.
Deploys to Cloudflare Pages for free.

## Two build modes

| Mode | Env flag | What it does |
|------|----------|--------------|
| **normal** | `PUBLIC_SHOW_SPONSORS=false` | Pure directory. Launch this. |
| **sponsor** | `PUBLIC_SHOW_SPONSORS=true` | Adds `/sponsors` page, Featured slots on home + categories, header banner slot |

Same codebase, same content. Flip the flag and rebuild when ready. Recommendation: launch normal this week, flip to sponsor mode after week 1 once you have traffic to sell.

---

## Prerequisites

- Node 20+
- Python 3.11+ (for the data export script)
- Your `~/mcp-scanner-pro/data/state.db` populated and scored

## One-time setup (local machine)

```bash
# Install dependencies
npm install

# Export DB → JSON (reads ~/mcp-scanner-pro/data/state.db)
# Set MCP_SCANNER_DB_PATH if your DB isn't at the default location
export MCP_SCANNER_DB_PATH=~/mcp-scanner-pro/data/state.db
npm run export-data

# Verify data files exist
ls -lh src/data/ public/data/
# Expected: servers.json, top.json, categories.json (in src/data/)
#           search-index.json (in public/data/)
```

**Important: commit the generated JSON files.**
Your `state.db` lives on your laptop — Cloudflare's build server can't read it.
The JSONs need to be in git so deploys work.

```bash
git add src/data/ public/data/
git commit -m "Refresh data export"
```

Re-run `npm run export-data` whenever you re-classify or re-score servers, then commit.

## Develop locally

```bash
npm run dev
# Opens http://localhost:4321
```

## Build for production

```bash
# Normal build (launch this first)
npm run build

# Sponsor build (deploy after week 1)
PUBLIC_SHOW_SPONSORS=true npm run build

# Output goes to dist/
```

---

## Deploy to Cloudflare Pages

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "v1 directory launch"
git remote add origin git@github.com:tanvithsreddy-del/safemcp.git
git push -u origin main
```

### 2. Connect Pages to GitHub

1. Go to https://dash.cloudflare.com → Workers & Pages → Create application → Pages → Connect to Git
2. Pick the `safemcp` repo
3. Build config:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Build output: `dist`
   - Root directory: (leave blank)
   - Environment variable: `PUBLIC_SHOW_SPONSORS=false` (for launch)
   - Note: `npm run build` runs the data export automatically
4. Save and Deploy

First build takes 3-7 minutes. Subsequent builds: ~2 min.

### 3. Point safemcp.info at Pages

In Cloudflare Pages → your project → Custom domains → Set up a custom domain → `safemcp.info`.

Cloudflare will give you either nameservers (if delegating DNS) or a CNAME (if keeping Njalla DNS).

**Option A — Delegate to Cloudflare (recommended):**
- In Njalla → DNS for safemcp.info → Change nameservers to whatever Cloudflare gives you (two `*.ns.cloudflare.com` addresses)
- Wait 1-24 hours for propagation
- Cloudflare auto-configures everything

**Option B — Keep Njalla DNS:**
- In Njalla → add a CNAME record: `safemcp.info` → `<your-project>.pages.dev`
- Add another CNAME: `www.safemcp.info` → `safemcp.info`
- TTL: 300 (5 min)

### 4. Verify

Visit https://safemcp.info — should resolve within an hour.

---

## Switching to sponsor mode (week 2)

```bash
# In Cloudflare Pages → Settings → Environment variables
# Change PUBLIC_SHOW_SPONSORS from "false" to "true"
# Trigger a new deployment (Settings → Deployments → Retry latest)
```

---

## Project structure

```
safemcp-site/
├── README.md                          # this file
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── public/                            # static assets (favicon, robots.txt)
├── scripts/
│   └── export_data.py                 # DB → JSON, runs at build time
├── src/
│   ├── data/                          # generated JSON (gitignored)
│   ├── layouts/
│   │   └── Base.astro                 # html shell + theme toggle
│   ├── components/
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── ServerRow.astro            # the dense list row
│   │   ├── ScoreBadge.astro
│   │   ├── SearchBox.astro            # client-side search
│   │   ├── CategoryGrid.astro
│   │   └── sponsor/                   # only renders when PUBLIC_SHOW_SPONSORS=true
│   │       ├── FeaturedSlot.astro
│   │       ├── HeaderBanner.astro
│   │       └── SponsorCTA.astro
│   ├── pages/
│   │   ├── index.astro                # home (/)
│   │   ├── browse.astro               # full searchable list
│   │   ├── about.astro
│   │   ├── sponsors.astro             # only when flag is on
│   │   ├── search.astro               # client-side results
│   │   ├── category/
│   │   │   └── [slug].astro           # one page per category (88 pages)
│   │   └── s/
│   │       └── [owner]/
│   │           └── [name].astro       # detail pages (top 1000 static, rest client-rendered)
│   ├── lib/
│   │   ├── data.ts                    # data loaders
│   │   ├── score.ts                   # score → color tier
│   │   └── flags.ts                   # sponsor mode flag
│   └── styles/
│       └── global.css                 # dark theme tokens
```

---

## Performance notes

- ~100 static HTML pages generated at build (home, browse, 88 categories, top 1000 detail, about)
- Detail pages for servers below top 1000 are client-rendered from `servers.json`
- Search index is ~5MB compressed JSON, loaded once and cached
- Total deploy size: ~80MB. Well within Cloudflare Pages free tier.

## License

Code: MIT. Data: see individual repo licenses.
