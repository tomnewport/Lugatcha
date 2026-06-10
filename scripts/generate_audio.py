#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "torch",
#   "transformers",
#   "soundfile",
# ]
# ///
"""Generate prebuilt Uzbek audio for Lugʻatcha.

Enumerates every spoken string in public/data (word entries, story sentences,
roleplay turns), synthesises each one with an Uzbek TTS model, and writes
content-addressed MP3s plus public/audio/manifest.json. The app looks clips up
by the same text hash (src/audio/key.ts) and falls back to the Web Speech API
for anything missing, so partial runs are safe.

Designed for a Mac with Apple Silicon (uses the MPS backend when available).

Setup (once):
    brew install uv ffmpeg

Usage:
    uv run scripts/generate_audio.py --dry-run     # list what would be made
    uv run scripts/generate_audio.py --limit 3     # try a few clips first
    uv run scripts/generate_audio.py               # generate everything missing
    uv run scripts/generate_audio.py --self-test   # verify hash parity only

Then commit public/audio/ and the app will pick the clips up automatically.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "public" / "data"
DEFAULT_OUT = REPO_ROOT / "public" / "audio"
FIXTURES = REPO_ROOT / "tests" / "audio-key-fixtures.json"

DEFAULT_MODEL = "uzlm/sayro-tts-1.7B"

# ---------------------------------------------------------------------------
# Text keying — MUST stay identical to src/audio/key.ts.
# tests/audio-key-fixtures.json pins both implementations; run --self-test
# after touching either side.
# ---------------------------------------------------------------------------

APOSTROPHES = re.compile(r"[‘’ʻʼ`´]")
WHITESPACE = re.compile(r"\s+")


def normalize_spoken_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = APOSTROPHES.sub("'", text)
    return WHITESPACE.sub(" ", text).strip()


def audio_key(text: str) -> str:
    normalized = normalize_spoken_text(text)
    h = 0xCBF29CE484222325
    for byte in normalized.encode("utf-8"):
        h ^= byte
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def self_test() -> None:
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    failures = [
        (text, expected, audio_key(text))
        for text, expected in fixtures.items()
        if audio_key(text) != expected
    ]
    for text, expected, got in failures:
        print(f"MISMATCH {text!r}: expected {expected}, got {got}", file=sys.stderr)
    if failures:
        sys.exit(1)
    print(f"self-test OK — {len(fixtures)} fixtures match src/audio/key.ts")


# ---------------------------------------------------------------------------
# Inventory: every string the app can speak aloud
# ---------------------------------------------------------------------------


def collect_texts() -> dict[str, str]:
    """Returns key -> text for all spoken strings, first occurrence wins."""
    manifest = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))
    texts: list[str] = []

    for name in manifest["words"]:
        for word in json.loads((DATA_DIR / "words" / f"{name}.json").read_text(encoding="utf-8")):
            texts.append(word["uzbek"])

    for name in manifest["stories"]:
        story = json.loads((DATA_DIR / "stories" / f"{name}.json").read_text(encoding="utf-8"))
        texts.extend(sentence["uzbek"] for sentence in story["sentences"])

    for name in manifest["roleplay"]:
        roleplay = json.loads((DATA_DIR / "roleplay" / f"{name}.json").read_text(encoding="utf-8"))
        for variant in roleplay["variants"]:
            texts.extend(turn["uzbek"] for turn in variant["turns"])

    collected: dict[str, str] = {}
    for text in texts:
        collected.setdefault(audio_key(text), normalize_spoken_text(text))
    return collected


# ---------------------------------------------------------------------------
# Synthesis
# ---------------------------------------------------------------------------


def pick_device() -> str:
    import torch

    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def load_synthesizer(model_id: str, device: str):
    """Returns synthesize(text) -> (samples: float32 1-D numpy array, rate: int).

    Tries the generic transformers text-to-speech pipeline first. If the model
    needs a bespoke generation recipe, this is the one function to adapt —
    follow the snippet on https://huggingface.co/uzlm/sayro-tts-1.7B and keep
    the return contract.
    """
    from transformers import pipeline

    try:
        tts = pipeline("text-to-speech", model=model_id, device=device)
    except Exception as error:  # noqa: BLE001 — surface a actionable hint
        sys.exit(
            f"Could not load {model_id} via the text-to-speech pipeline: {error}\n\n"
            "If the model card shows a custom usage snippet, adapt "
            "load_synthesizer() in this script to it (keep the "
            "synthesize(text) -> (samples, rate) contract). Also check you "
            "are logged in if the model is gated: `huggingface-cli login`."
        )

    def synthesize(text: str):
        result = tts(text)
        samples = result["audio"]
        if samples.ndim > 1:  # some models return (channels, n) or (1, n)
            samples = samples.squeeze()
        return samples, result["sampling_rate"]

    return synthesize


def write_mp3(samples, rate: int, target: Path, ffmpeg: str) -> None:
    import soundfile

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = Path(tmp.name)
    try:
        soundfile.write(wav_path, samples, rate)
        subprocess.run(
            [ffmpeg, "-y", "-loglevel", "error", "-i", str(wav_path),
             "-ac", "1", "-b:a", "64k", str(target)],
            check=True,
        )
    finally:
        wav_path.unlink(missing_ok=True)


def write_manifest(out_dir: Path) -> int:
    files = sorted(p.name for p in out_dir.glob("*.mp3"))
    manifest = {p.removesuffix(".mp3"): p for p in files}
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return len(manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--device", default=None, help="mps / cuda / cpu (default: auto)")
    parser.add_argument("--limit", type=int, default=None, help="generate at most N clips")
    parser.add_argument("--force", action="store_true", help="regenerate existing clips")
    parser.add_argument("--dry-run", action="store_true", help="list texts and exit")
    parser.add_argument("--self-test", action="store_true", help="verify hash parity and exit")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return

    self_test()  # always guard a real run against key drift
    texts = collect_texts()
    print(f"{len(texts)} unique spoken strings in public/data")

    if args.dry_run:
        for key, text in sorted(texts.items(), key=lambda kv: kv[1]):
            print(f"{key}  {text}")
        return

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        sys.exit("ffmpeg not found — install it with `brew install ffmpeg`")

    args.out.mkdir(parents=True, exist_ok=True)
    pending = {
        key: text
        for key, text in texts.items()
        if args.force or not (args.out / f"{key}.mp3").exists()
    }
    if args.limit is not None:
        pending = dict(list(pending.items())[: args.limit])
    print(f"{len(pending)} clips to generate, {len(texts) - len(pending)} already present")

    if pending:
        device = args.device or pick_device()
        print(f"loading {args.model} on {device}…")
        synthesize = load_synthesizer(args.model, device)

        for i, (key, text) in enumerate(pending.items(), 1):
            print(f"[{i}/{len(pending)}] {text}")
            samples, rate = synthesize(text)
            write_mp3(samples, rate, args.out / f"{key}.mp3", ffmpeg)

    count = write_manifest(args.out)
    total_kb = sum(p.stat().st_size for p in args.out.glob("*.mp3")) // 1024
    print(f"manifest.json lists {count} clips ({total_kb} KiB total) in {args.out}")


if __name__ == "__main__":
    # Die quietly when piped into head etc.
    import signal

    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    main()
