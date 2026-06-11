#!/usr/bin/env python3
"""Apply an audio review (reviews.json exported from the in-app review screen).

For each reviewed word:
  * if any candidate was marked good, promote the first good one to the
    canonical public/audio/<key>.mp3, mark it reviewed in the manifest, and
    delete that word's candidate files (it's done);
  * if no candidate was good, delete the word's candidates so a subsequent
    `generate_audio.py --candidates` regenerates fresh ones to re-review.

Then both manifests are rewritten. This is the agent-side half of the review
loop; you re-run --candidates afterwards to regenerate the words that need it.

Usage:
    uv run python scripts/apply_reviews.py reviews.json
    uv run python scripts/apply_reviews.py reviews.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
AUDIO_DIR = REPO_ROOT / "public" / "audio"
CANDIDATES_DIR = AUDIO_DIR / "candidates"

# Reuse the canonical manifest/text helpers from the generator.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_audio import collect_texts, write_candidates_manifest  # noqa: E402


def load_main_manifest() -> dict:
    """Load audio/manifest.json, normalising legacy {key: 'file'} entries."""
    path = AUDIO_DIR / "manifest.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    manifest = {}
    for key, value in raw.items():
        if isinstance(value, str):
            manifest[key] = {"file": value, "reviewed": False}
        else:
            manifest[key] = {
                "file": value.get("file", f"{key}.mp3"),
                "reviewed": bool(value.get("reviewed")),
            }
    return manifest


def write_main_manifest(manifest: dict) -> None:
    (AUDIO_DIR / "manifest.json").write_text(
        json.dumps(dict(sorted(manifest.items())), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def candidate_files(key: str) -> list[Path]:
    return list(CANDIDATES_DIR.glob(f"{key}-*.mp3"))


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("reviews", type=Path, help="reviews.json from the review screen")
    parser.add_argument("--dry-run", action="store_true", help="report actions, change nothing")
    args = parser.parse_args()

    data = json.loads(args.reviews.read_text(encoding="utf-8"))
    records = data["reviews"] if isinstance(data, dict) and "reviews" in data else data

    manifest = load_main_manifest()
    promoted = regen = bad = 0

    for record in records:
        key = record["key"]
        verdicts = record.get("verdicts", {})
        bad += sum(1 for v in verdicts.values() if v == "bad")
        good = [pid for pid, verdict in verdicts.items() if verdict == "good"]

        if good:
            chosen = good[0]
            src = CANDIDATES_DIR / f"{key}-{chosen}.mp3"
            if not src.exists():
                print(f"  ! missing {src.name}; skipping {key}", file=sys.stderr)
                continue
            print(f"  promote {key} <- {chosen}")
            if not args.dry_run:
                shutil.copyfile(src, AUDIO_DIR / f"{key}.mp3")
                for path in candidate_files(key):
                    path.unlink(missing_ok=True)
            manifest[key] = {"file": f"{key}.mp3", "reviewed": True}
            promoted += 1
        else:
            print(f"  regen   {key} (no good candidate)")
            if not args.dry_run:
                for path in candidate_files(key):
                    path.unlink(missing_ok=True)
            regen += 1

    if args.dry_run:
        print(f"[dry-run] would promote {promoted}, flag {regen} for regen, drop {bad} bad clips")
        return

    write_main_manifest(manifest)
    remaining = write_candidates_manifest(CANDIDATES_DIR, collect_texts()) if CANDIDATES_DIR.exists() else 0
    print(
        f"promoted {promoted} reviewed clips, flagged {regen} words for regeneration, "
        f"dropped {bad} bad candidates. candidates manifest now lists {remaining} words.\n"
        f"Re-run: uv run python scripts/generate_audio.py --candidates  (regenerates the flagged words)"
    )


if __name__ == "__main__":
    main()
