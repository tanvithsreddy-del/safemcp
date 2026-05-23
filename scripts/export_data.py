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
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

# Resolve DB path
DB_ENV = os.environ.get("MCP_SCANNER_DB_PATH")
DB_PATH = Path(DB_ENV).expanduser() if DB_ENV else Path.home() / "mcp-scanner-pro" / "data" / "state.db"

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = PROJECT_ROOT / "src" / "data"
PUBLIC_DATA_DIR = PROJECT_ROOT / "public" / "data"
OUT_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)


def _row_to_dict(row: sqlite3.Row) -> dict:
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

    # 3) Top 1000 (for home page and static detail pages)
    top = servers[:1000]
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
