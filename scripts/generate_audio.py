#!/usr/bin/env python3
"""Generate prebuilt Uzbek audio for Lugʻatcha.

Enumerates every spoken string in public/data (word entries, story sentences,
roleplay turns), synthesises each one with an Uzbek TTS backend, and writes
content-addressed MP3s plus public/audio/manifest.json. The app looks clips up
by the same text hash (src/audio/key.ts) and falls back to the Web Speech API
for anything missing, so partial runs are safe.

Two backends:
  --backend local  (default)  Runs the uzlm/sayro-tts-1.7B Uzbek model on this
                              machine via the Qwen3-TTS `qwen_tts` runtime. The
                              model is gated — request access on its HuggingFace
                              page and `huggingface-cli login` first. No account
                              billing, no network at synth time once downloaded.
  --backend yandex            Calls the Yandex SpeechKit v1 REST API. Needs a
                              Yandex Cloud service-account API key with the
                              ai.speechKit-tts.user role, plus the folder ID.
                              The host is parameterised so it works against the
                              Kazakhstan cloud (tts.api.yandexcloud.kz, default)
                              or the Russia cloud (tts.api.cloud.yandex.net).

Setup (once):
    git clone https://github.com/tomnewport/Lugatcha.git
    cd Lugatcha
    brew install uv ffmpeg sox      # sox is required by the local qwen_tts backend

Usage (local backend):
    huggingface-cli login                                 # gated Sayro access
    uv run python scripts/generate_audio.py --dry-run     # list what would be made
    uv run python scripts/generate_audio.py --limit 3     # try a few clips first
    uv run python scripts/generate_audio.py --device mps  # try the GPU (CPU is slow)
    uv run python scripts/generate_audio.py               # generate everything missing
    uv run python scripts/generate_audio.py --self-test   # verify hash parity only

Usage (Yandex backend):
    export YANDEX_API_KEY=AQVN...          # service-account API key (keep secret)
    export YANDEX_FOLDER_ID=b1g...         # folder the service account lives in
    uv run python scripts/generate_audio.py --backend yandex --limit 1   # smoke test
    uv run python scripts/generate_audio.py --backend yandex             # everything
    # Russia cloud instead of Kazakhstan:
    #   --backend yandex --yandex-host tts.api.cloud.yandex.net

Then commit public/audio/ and the app will pick the clips up automatically.
"""

from __future__ import annotations

import argparse
import json
import os
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
        stories = json.loads((DATA_DIR / "stories" / f"{name}.json").read_text(encoding="utf-8"))
        for story in stories:
            texts.extend(sentence["uzbek"] for sentence in story["sentences"])

    for name in manifest["roleplay"]:
        roleplays = json.loads((DATA_DIR / "roleplay" / f"{name}.json").read_text(encoding="utf-8"))
        for roleplay in roleplays:
            for variant in roleplay["variants"]:
                texts.extend(turn["uzbek"] for turn in variant["turns"])

    # Language School lessons: spoken examples and exercise audio
    lessons_dir = DATA_DIR / "lessons"
    if lessons_dir.exists():
        for meta in json.loads((lessons_dir / "index.json").read_text(encoding="utf-8")):
            lesson = json.loads((lessons_dir / f"{meta['id']}.json").read_text(encoding="utf-8"))
            for section in lesson["sections"]:
                texts.extend(ex["uzbek"] for ex in section.get("examples", []))
            for exercise in lesson["exercises"]:
                if exercise.get("promptUzbek"):
                    texts.append(exercise["promptUzbek"])
                if exercise["engine"] == "build":
                    joiner = exercise.get("joiner", " ")
                    texts.append(exercise.get("audioText") or joiner.join(exercise["tokens"]))

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


def load_synthesizer(model_id: str, device: str, speaker: str, instruct: str,
                     explicit_device: bool = False):
    """Returns synthesize(text) -> (samples: float32 1-D numpy array, rate: int).

    Backed by the Qwen3-TTS `qwen_tts` runtime that uzlm/sayro-tts-1.7B is built
    on, following the model card's Quickstart. The upstream example assumes an
    NVIDIA GPU (device_map="cuda:0", bfloat16); this falls back to CPU
    elsewhere. The `speaker` ("sayro") and `instruct` (a style hint like
    "Happy"/"Neutral"/"") are the card's generate_custom_voice arguments.
    """
    import numpy as np
    import torch

    try:
        from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel
    except ImportError:
        try:
            from qwen_tts import Qwen3TTSModel  # fallback for other layouts
        except ImportError:
            sys.exit(
                "The local backend needs the Qwen3-TTS runtime: `uv pip install qwen-tts`.\n"
                "uzlm/sayro-tts-1.7B is a Qwen3-TTS fine-tune, not a generic "
                "transformers text-to-speech pipeline model."
            )

    # The card normalises Uzbek text (numbers, punctuation) before synthesis.
    # This only shapes what the model hears — the clip's key/filename stays
    # based on the original text (normalize_spoken_text), so the app still
    # finds it. Optional: pass text through unchanged if the package is absent.
    try:
        from uzbek_normalizer import clean_uzbek_text
    except ImportError:
        print("uzbek_normalizer not found (it isn't on PyPI); feeding raw text. "
              "Fine for most content — numbers/abbreviations just won't be "
              "expanded to words.")

        def clean_uzbek_text(text: str) -> str:
            return text

    # CUDA gets its own device. The card's only documented CPU-class fallback is
    # plain CPU, and MPS tends to hit unsupported ops in this stack, so an
    # auto-detected MPS is routed to CPU — but an explicit --device mps is
    # honoured so you can try the GPU (much faster when it works).
    if device == "cuda":
        target, dtype = "cuda:0", torch.bfloat16
    elif device == "mps" and not explicit_device:
        print("MPS auto-detected but unreliable for Qwen3-TTS; loading on CPU. "
              "Pass --device mps to force the GPU.")
        target, dtype = "cpu", torch.bfloat16
    elif device == "mps":
        target, dtype = "mps", torch.float32  # forced; mps prefers float32
    else:
        target, dtype = "cpu", torch.bfloat16
    print(f"loading {model_id} on {target} (CPU synthesis is slow, ~minutes/clip)…")
    load_kwargs = dict(device_map=target, dtype=dtype)

    try:
        model = Qwen3TTSModel.from_pretrained(model_id, **load_kwargs)
    except Exception as error:  # noqa: BLE001 — surface an actionable hint
        sys.exit(
            f"Could not load {model_id}: {error}\n\n"
            "If the repo is gated, request access on the model page and log in "
            "with `huggingface-cli login` (or set HF_TOKEN). If from_pretrained's "
            "signature has changed, follow the model card's Quickstart and adapt "
            "load_synthesizer()."
        )

    def synthesize(text: str):
        with torch.inference_mode():
            wavs, rate = model.generate_custom_voice(
                text=[clean_uzbek_text(text)],
                speaker=[speaker],
                instruct=[instruct],
            )
        waveform = wavs[0]
        if hasattr(waveform, "detach"):  # torch tensor -> numpy
            waveform = waveform.detach().cpu().numpy()
        return np.asarray(waveform, dtype="float32").squeeze(), rate

    return synthesize


# Yandex SpeechKit v1 caps each request at 250 characters. Stay safely under it
# and split longer strings on word boundaries; the chunks are concatenated.
YANDEX_CHAR_LIMIT = 240


def chunk_text(text: str, limit: int = YANDEX_CHAR_LIMIT) -> list[str]:
    """Split text into <=limit-char pieces, breaking on whitespace."""
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and len(candidate) > limit:
            chunks.append(current)
            current = word
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks or [text]


def load_yandex_synthesizer(
    host: str,
    api_key: str,
    folder_id: str,
    voice: str,
    lang: str,
    sample_rate: int = 48000,
):
    """Returns synthesize(text) -> (samples, rate) backed by Yandex SpeechKit.

    Requests raw little-endian 16-bit PCM (format=lpcm) so the bytes drop
    straight into the existing soundfile/ffmpeg pipeline with no extra decode.
    """
    import urllib.error
    import urllib.parse
    import urllib.request

    import numpy as np

    url = f"https://{host}/speech/v1/tts:synthesize"
    headers = {"Authorization": f"Api-Key {api_key}"}

    def synth_chunk(text: str):
        body = urllib.parse.urlencode(
            {
                "text": text,
                "lang": lang,
                "voice": voice,
                "format": "lpcm",
                "sampleRateHertz": str(sample_rate),
                "folderId": folder_id,
            }
        ).encode("utf-8")
        request = urllib.request.Request(url, data=body, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", "replace")
            sys.exit(
                f"Yandex TTS request failed: HTTP {error.code}\n{detail}\n\n"
                "Common causes: wrong --yandex-host for your cloud (KZ vs RU), "
                "an API key from the other installation, a missing "
                "ai.speechKit-tts.user role, or 'uz-UZ'/'nigora' not being "
                "available in this region."
            )
        except urllib.error.URLError as error:
            sys.exit(
                f"Could not reach {host}: {error.reason}\n\n"
                "If the host does not resolve, this cloud likely has no TTS "
                "endpoint — try --yandex-host tts.api.cloud.yandex.net (Russia) "
                "or fall back to --backend local."
            )
        return np.frombuffer(raw, dtype="<i2")

    def synthesize(text: str):
        pieces = [synth_chunk(chunk) for chunk in chunk_text(text)]
        samples = pieces[0] if len(pieces) == 1 else np.concatenate(pieces)
        return samples, sample_rate

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
    parser.add_argument("--backend", choices=("local", "yandex"), default="local",
                        help="local HuggingFace model (default) or Yandex SpeechKit")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="local backend model id")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--device", default=None, help="mps / cuda / cpu (default: auto)")
    parser.add_argument("--qwen-speaker", default="sayro",
                        help="local Qwen3-TTS speaker name (default: sayro)")
    parser.add_argument("--qwen-instruct", default="",
                        help="local Qwen3-TTS style hint, e.g. Happy/Neutral (default: none)")
    parser.add_argument("--yandex-host", default="tts.api.yandexcloud.kz",
                        help="SpeechKit host (KZ default; RU is tts.api.cloud.yandex.net)")
    parser.add_argument("--yandex-voice", default="nigora", help="Yandex voice (default: nigora)")
    parser.add_argument("--yandex-lang", default="uz-UZ", help="Yandex language tag")
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
        if args.backend == "yandex":
            api_key = os.environ.get("YANDEX_API_KEY")
            folder_id = os.environ.get("YANDEX_FOLDER_ID")
            if not api_key or not folder_id:
                sys.exit(
                    "Set YANDEX_API_KEY and YANDEX_FOLDER_ID for --backend yandex.\n"
                    "Create a service-account API key (role ai.speechKit-tts.user) "
                    "in your Yandex Cloud console and export both as env vars."
                )
            print(f"using Yandex SpeechKit at {args.yandex_host} "
                  f"(voice={args.yandex_voice}, lang={args.yandex_lang})…")
            synthesize = load_yandex_synthesizer(
                args.yandex_host, api_key, folder_id, args.yandex_voice, args.yandex_lang
            )
        else:
            device = args.device or pick_device()
            synthesize = load_synthesizer(
                args.model, device, args.qwen_speaker, args.qwen_instruct,
                explicit_device=args.device is not None,
            )

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
