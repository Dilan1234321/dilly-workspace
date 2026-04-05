#!/usr/bin/env python3
"""
Read memory/dilly_audit_log.jsonl and list candidates suitable for few-shot examples.
Use --min-final to filter by final score; --use-for-fewshot to only list entries marked use_for_fewshot.
Output: summary stats and list of log entries (track, scores) so you can curate training_data.json.
"""
import argparse
import json
import os
import sys

WORKSPACE = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
LOG_PATH = os.path.join(WORKSPACE, "memory", "dilly_audit_log.jsonl")


def main():
    ap = argparse.ArgumentParser(description="Export audit log entries as few-shot candidates")
    ap.add_argument("--min-final", type=float, default=0, help="Minimum final_score to include")
    ap.add_argument("--use-for-fewshot", action="store_true", help="Only include entries with use_for_fewshot=true")
    ap.add_argument("--by-track", action="store_true", help="Group output by track")
    args = ap.parse_args()

    if not os.path.isfile(LOG_PATH):
        print(f"No log at {LOG_PATH}", file=sys.stderr)
        sys.exit(1)

    entries = []
    with open(LOG_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            if args.use_for_fewshot and not e.get("use_for_fewshot"):
                continue
            if e.get("final", 0) < args.min_final:
                continue
            entries.append(e)

    if args.by_track:
        by_track: dict[str, list] = {}
        for e in entries:
            t = e.get("track") or "Humanities"
            by_track.setdefault(t, []).append(e)
        for track, list_e in sorted(by_track.items()):
            print(f"\n{track} ({len(list_e)})")
            for e in list_e[:10]:
                print(f"  final={e.get('final')} smart={e.get('smart')} grit={e.get('grit')} build={e.get('build')} ts={e.get('ts')}")
            if len(list_e) > 10:
                print(f"  ... and {len(list_e) - 10} more")
    else:
        for e in entries[-50:]:  # last 50
            print(json.dumps(e))
    print(f"\nTotal: {len(entries)} entries", file=sys.stderr)


if __name__ == "__main__":
    main()
