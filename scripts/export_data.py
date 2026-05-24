#!/usr/bin/env python3
"""Export mcp-scanner-pro state.db to JSON files Astro can consume at build time.

Writes:
  src/data/servers.json            — every verified server, full columns (the firehose)
  src/data/top.json                — top 1000 by recommended_score
  src/data/categories.json         — category metadata (name, count, avg score, top 5)
  public/data/search-index.json    — lightweight index for client-side search (runtime fetched)

Run:
  python3 scripts/export_data.py

DB path resolves from $MCP_SCANNER_DB_PATH or ~/mcp-scanner-pro/data/state.db
"""
from __future__ import annotations

import json
import os
import sys
from collections import defaultdict
from pathlib import Path

# sqlite3 is imported lazily inside main() so this script doesn't crash
# on environments without sqlite3 (e.g. Cloudflare Pages build container,
# which uses a Python install without the sqlite3 module). On those
# environments we never need sqlite3 because we use the committed JSON.

# Resolve DB path
DB_ENV = os.environ.get("MCP_SCANNER_DB_PATH")
DB_PATH = Path(DB_ENV).expanduser() if DB_ENV else Path.home() / "mcp-scanner-pro" / "data" / "state.db"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = PROJECT_ROOT / "src" / "data"
PUBLIC_DATA_DIR = PROJECT_ROOT / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)


def _row_to_dict(row) -> dict:
    """Convert a SQLite row to a dict, normalising booleans and strings."""
    d = dict(row)
    # Normalise SQLite bool ints to JS booleans where the column name suggests bool
    for k, v in list(d.items()):
        if k.startswith("is_") or k.startswith("requires_") or k.startswith("has_"):
            if v is not None:
                d[k] = bool(v)
    return d


def main() -> None:
    if not DB_PATH.exists():
        # On Cloudflare Pages builds, the DB won't exist — that's fine,
        # the JSON files generated locally and committed to git will be used.
        # We only abort if BOTH the DB is missing AND no committed data exists.
        servers_path = OUT_DIR / "servers.json"
        if servers_path.exists():
            print(f"DB not found at {DB_PATH}, but committed data exists. Skipping export.")
            print("(This is normal during Cloudflare Pages build — using committed JSON.)")
            return
        print(f"FATAL: DB not found at {DB_PATH} AND no committed data in src/data/", file=sys.stderr)
        print("Run this locally first, commit the generated JSON, then deploy.", file=sys.stderr)
        sys.exit(1)

    # Lazy import — only needed when we actually read from the DB
    import sqlite3

    print(f"Reading from {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # 1) Verified servers — the website set
    cur = conn.execute(
        """
        SELECT * FROM server
        WHERE is_mcp_server = 1
          AND is_list_or_tutorial = 0
          AND is_sdk_or_framework = 0
        ORDER BY recommended_score DESC, stars DESC
        """
    )
    servers = [_row_to_dict(r) for r in cur.fetchall()]
    print(f"  Verified servers: {len(servers):,}")

    if not servers:
        print("FATAL: no verified servers in DB. Run `mcps classify && mcps score` first.", file=sys.stderr)
        sys.exit(1)

    # 2) Write servers.json (full data)
    servers_path = OUT_DIR / "servers.json"
    with open(servers_path, "w") as f:
        json.dump(servers, f, separators=(",", ":"))
    print(f"  Wrote {servers_path.name}: {servers_path.stat().st_size / 1024 / 1024:.1f} MB")

    # 3) Top 3000 (for home page and static detail pages).
    # Increased from 1000 to reduce 404 rate when users click long-tail entries
    # in category pages. ServerRow falls back to direct GitHub links for the rest.
    top = servers[:3000]
    top_path = OUT_DIR / "top.json"
    with open(top_path, "w") as f:
        json.dump(top, f, separators=(",", ":"))
    print(f"  Wrote {top_path.name}: {top_path.stat().st_size / 1024:.1f} KB")

    # 4) Categories
    by_cat: dict[str, list] = defaultdict(list)
    for s in servers:
        cat = (s.get("mcp_category") or "unknown").strip() or "unknown"
        by_cat[cat].append(s)

    categories = []
    for cat, items in sorted(by_cat.items(), key=lambda kv: -len(kv[1])):
        total = sum(s.get("recommended_score") or 0 for s in items)
        avg = round(total / max(1, len(items)), 1)
        categories.append({
            "slug": cat,
            "name": cat,
            "count": len(items),
            "avg_score": avg,
            "top5": [
                {
                    "name": s["name"],
                    "owner": s["owner"],
                    "score": s.get("recommended_score") or 0,
                    "stars": s.get("stars") or 0,
                }
                for s in items[:5]
            ],
        })
    categories_path = OUT_DIR / "categories.json"
    with open(categories_path, "w") as f:
        json.dump(categories, f, separators=(",", ":"))
    print(f"  Wrote {categories_path.name}: {len(categories)} categories")

    # 4b) stats.json — TINY file (<1 KB) with precomputed totals.
    # Read by Footer, SearchBox, ScoreDistribution — components that
    # are bundled into the Worker via the Base layout. Without this,
    # those components would import lib/data.ts which pulls all 35 MB
    # of servers.json into the Worker bundle (exceeding the 3 MB limit).
    score_buckets = [
        {"bucket": "80-100", "lo": 80, "hi": 100},
        {"bucket": "60-79",  "lo": 60, "hi": 79},
        {"bucket": "40-59",  "lo": 40, "hi": 59},
        {"bucket": "20-39",  "lo": 20, "hi": 39},
        {"bucket": "0-19",   "lo": 0,  "hi": 19},
    ]
    total = len(servers) or 1
    score_distribution = []
    for b in score_buckets:
        count = sum(
            1 for s in servers
            if b["lo"] <= (s.get("recommended_score") or 0) <= b["hi"]
        )
        score_distribution.append({
            "bucket": b["bucket"],
            "count": count,
            "pct": round((count / total) * 1000) / 10,
        })

    runtime_counts: dict[str, int] = {}
    for s in servers:
        r = (s.get("runtime") or "unknown").lower()
        runtime_counts[r] = runtime_counts.get(r, 0) + 1
    runtimes_sorted = sorted(
        [{"runtime": k, "count": v} for k, v in runtime_counts.items()],
        key=lambda x: -x["count"],
    )

    stats = {
        "total": len(servers),
        "scoreDistribution": score_distribution,
        "runtimes": runtimes_sorted,
    }
    stats_path = OUT_DIR / "stats.json"
    with open(stats_path, "w") as f:
        json.dump(stats, f, separators=(",", ":"))
    print(f"  Wrote {stats_path.name}: {stats_path.stat().st_size} bytes")

    # 5) Search index (lightweight — only fields needed to match + display)
    search_index = [
        {
            "n": s["name"],
            "o": s["owner"],
            "d": (s.get("description") or "")[:240],
            "c": s.get("mcp_category") or "unknown",
            "s": s.get("recommended_score") or 0,
            "st": s.get("stars") or 0,
            "pf": (s.get("primary_function") or "")[:160],
        }
        for s in servers
    ]
    search_path = PUBLIC_DATA_DIR / "search-index.json"
    with open(search_path, "w") as f:
        json.dump(search_index, f, separators=(",", ":"))
    print(f"  Wrote public/data/{search_path.name}: {search_path.stat().st_size / 1024 / 1024:.1f} MB")

    print()
    print(f"Export complete. {len(servers):,} servers across {len(categories)} categories.")


if __name__ == "__main__":
    main()
