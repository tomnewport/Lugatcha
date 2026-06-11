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
    uv run python scripts/generate_audio.py --candidates   # 3 variants/word for in-app review
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


# ---------------------------------------------------------------------------
# Uzbek text normalisation for the local Sayro model
#
# uzlm/sayro-tts-1.7B's card pre-processes text with a `clean_uzbek_text`
# helper that ships only inside the gated repo (not on PyPI). This reproduces
# it so the backend is self-contained: Cyrillic -> Latin, digits -> spelled-out
# Uzbek (ordinal when a hyphen trails, e.g. "1984-" -> "...to'rtinchi"), and
# apostrophe/punctuation folding to the ʻ the model expects. It only shapes
# what the model hears — clip keys stay based on the original text
# (normalize_spoken_text), so the app still resolves every file.
# ---------------------------------------------------------------------------

CYRILLIC_TO_LATIN = {
    "А": "A", "Б": "B", "В": "V", "Г": "G", "Д": "D", "Е": "E", "Ё": "Yo", "Ж": "J", "З": "Z",
    "И": "I", "Й": "Y", "К": "K", "Л": "L", "М": "M", "Н": "N", "О": "O", "П": "P", "Р": "R",
    "С": "S", "Т": "T", "У": "U", "Ф": "F", "Х": "X", "Ц": "Ts", "Ч": "Ch", "Ш": "Sh", "Ъ": "'",
    "Ь": "", "Э": "E", "Ю": "Yu", "Я": "Ya", "Ў": "O'", "Қ": "Q", "Ғ": "G'", "Ҳ": "H",
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo", "ж": "j", "з": "z",
    "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r",
    "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "ts", "ч": "ch", "ш": "sh", "ъ": "'",
    "ь": "", "э": "e", "ю": "yu", "я": "ya", "ў": "o'", "қ": "q", "ғ": "g'", "ҳ": "h",
}

ONES = {0: "nol", 1: "bir", 2: "ikki", 3: "uch", 4: "to'rt", 5: "besh",
        6: "olti", 7: "yetti", 8: "sakkiz", 9: "to'qqiz"}
TENS = {10: "o'n", 20: "yigirma", 30: "o'ttiz", 40: "qirq", 50: "ellik",
        60: "oltmish", 70: "yetmish", 80: "sakson", 90: "to'qson"}


def _transliterate_cyrillic(text: str) -> str:
    for cyr, lat in CYRILLIC_TO_LATIN.items():
        text = text.replace(cyr, lat)
    return text


def _spell_hundreds(n: int) -> list[str]:
    """Spell 0 <= n < 1000 as Uzbek words (empty list for 0)."""
    parts: list[str] = []
    if n >= 100:
        hundreds = n // 100
        parts.append("yuz" if hundreds == 1 else f"{ONES[hundreds]} yuz")
        n %= 100
    if n >= 10:
        parts.append(TENS[(n // 10) * 10])
        n %= 10
    if n > 0:
        parts.append(ONES[n])
    return parts


def _spell_number(n: int) -> str:
    """Spell a non-negative integer in Uzbek. Extends the card's helper past
    9999 (it only handled four digits) so large numbers never crash a run."""
    if n == 0:
        return ONES[0]
    parts: list[str] = []
    if n >= 1_000_000:
        parts.append(_spell_number(n // 1_000_000))
        parts.append("million")
        n %= 1_000_000
    if n >= 1000:
        thousands = n // 1000
        parts.append("bir ming" if thousands == 1 else f"{_spell_number(thousands)} ming")
        n %= 1000
    parts.extend(_spell_hundreds(n))
    return " ".join(parts)


def _normalize_numbers(text: str) -> str:
    def replace(match: re.Match) -> str:
        spelled = _spell_number(int(match.group(1)))
        if match.group(2) == "-":  # trailing hyphen marks an ordinal
            suffix = "nchi" if spelled[-1] in "aeiou'" else "inchi"
            return f"{spelled}{suffix} "
        return spelled

    return re.sub(r"(\d+)(-?)", replace, text)


def clean_uzbek_text(text: str) -> str:
    """Built-in equivalent of the Sayro card's clean_uzbek_text()."""
    text = _transliterate_cyrillic(text)
    text = _normalize_numbers(text)
    # Ellipses make the model pause oddly or wander — collapse "…"/"..."/". . ."
    # to a single period.
    text = text.replace("…", ".")
    text = re.sub(r"(?:\s*\.){2,}", ".", text)
    for src in ("'", "’", "‘", "ʼ", "`", "»", "«", "”", "“"):
        text = text.replace(src, "ʻ")
    text = text.replace("—", "-").replace("• ", "").replace("\n", " ")
    return re.sub(r"\s+", " ", text).strip()


# A bare word gives autoregressive TTS no cue to stop, so it hallucinates extra
# words. A trailing full stop is the standard fix; sentences already ending in
# these are left alone.
_END_PUNCT = set(".!?…:;")


def _strip_terminal_punct(text: str) -> str:
    return text.rstrip("".join(_END_PUNCT)).rstrip()


def is_short_word(text: str, max_chars: int) -> bool:
    """A single short token (no spaces) — the cold-start case the model garbles."""
    bare = _strip_terminal_punct(text)
    return bool(bare) and " " not in bare and len(bare) <= max_chars


def coerce_gen_value(value: str):
    """Turn a CLI --gen-kwarg string into bool/int/float/None where it looks like one."""
    low = value.lower()
    if low in ("true", "false"):
        return low == "true"
    if low in ("none", "null"):
        return None
    for cast in (int, float):
        try:
            return cast(value)
        except ValueError:
            pass
    return value


def load_model(model_id: str, device: str, explicit_device: bool = False):
    """Load the Qwen3-TTS model and Uzbek normaliser. Returns (model, normalize).

    uzlm/sayro-tts-1.7B runs on the `qwen_tts` runtime. The upstream example
    assumes an NVIDIA GPU (device_map="cuda:0", bfloat16); this falls back to
    CPU elsewhere. One load serves any number of synthesizers (see
    make_synthesize), which is what candidates mode relies on.
    """
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

    # Prefer the repo-local uzbek_normalizer if it happens to be importable
    # (e.g. you put the gated example/ file on PYTHONPATH); otherwise use the
    # built-in equivalent above.
    try:
        from uzbek_normalizer import clean_uzbek_text as normalize
    except ImportError:
        normalize = clean_uzbek_text
        print("using built-in Uzbek normaliser (Cyrillic→Latin, number "
              "expansion, apostrophe folding)")

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

    try:
        model = Qwen3TTSModel.from_pretrained(model_id, device_map=target, dtype=dtype)
    except Exception as error:  # noqa: BLE001 — surface an actionable hint
        sys.exit(
            f"Could not load {model_id}: {error}\n\n"
            "If the repo is gated, request access on the model page and log in "
            "with `huggingface-cli login` (or set HF_TOKEN). If from_pretrained's "
            "signature has changed, follow the model card's Quickstart and adapt "
            "load_model()."
        )

    return model, normalize


def make_synthesize(model, normalize, speaker: str, instruct: str, *,
                    gen_kwargs: dict | None = None, end_punct: bool = True,
                    carrier: bool = True, carrier_word: str = "Mana",
                    carrier_max_chars: int = 4, carrier_pad_ms: int = 80):
    """Return synthesize(text) -> (samples: float32 1-D array, rate) for a model.

    Decoupled from loading so a single loaded model can drive several
    synthesizers with different generation settings (candidates mode).
    """
    import numpy as np
    import torch

    extra = gen_kwargs or {}

    def _generate(model_text: str):
        with torch.inference_mode():
            wavs, rate = model.generate_custom_voice(
                text=[model_text],
                speaker=[speaker],
                instruct=[instruct],
                **extra,
            )
        waveform = wavs[0]
        if hasattr(waveform, "detach"):  # torch tensor -> numpy
            waveform = waveform.detach().cpu().numpy()
        return np.asarray(waveform, dtype="float32").reshape(-1), rate

    def synthesize(text: str):
        core = normalize(text).strip()
        # Ultra-short words cold-start badly; speak them after a carrier so the
        # model has momentum, then crop back to just the word.
        if carrier and is_short_word(core, carrier_max_chars):
            bare = _strip_terminal_punct(core)
            audio, rate = _generate(f"{carrier_word}, {bare}.")
            cropped = crop_after_carrier(audio, rate, carrier_pad_ms)
            if cropped is not None and cropped.size:
                return cropped, rate
            # couldn't isolate the word — fall through to a plain attempt

        model_text = core
        if end_punct and model_text and model_text[-1] not in _END_PUNCT:
            model_text += "."  # give short inputs a clear stop cue
        return _generate(model_text)

    return synthesize


def load_synthesizer(model_id: str, device: str, speaker: str, instruct: str,
                     explicit_device: bool = False, gen_kwargs: dict | None = None,
                     end_punct: bool = True, carrier: bool = True,
                     carrier_word: str = "Mana", carrier_max_chars: int = 4,
                     carrier_pad_ms: int = 80):
    """Convenience wrapper: load a model and bind one synthesizer to it."""
    model, normalize = load_model(model_id, device, explicit_device)
    return make_synthesize(
        model, normalize, speaker, instruct, gen_kwargs=gen_kwargs,
        end_punct=end_punct, carrier=carrier, carrier_word=carrier_word,
        carrier_max_chars=carrier_max_chars, carrier_pad_ms=carrier_pad_ms,
    )


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


# ---------------------------------------------------------------------------
# Post-processing: trim leading/trailing non-speech
#
# Autoregressive TTS (Qwen3-TTS included) tends to bookend utterances with a
# click/breath at the start and a tail of garbage/noise at the end. Silero VAD
# finds the real speech span — robust even when the tail is loud, which a plain
# volume gate would keep — and we crop to it (+ a little padding). Falls back to
# an energy gate, then to the untouched clip, so a bad clip never kills a run.
# ---------------------------------------------------------------------------

_silero_vad = None


def _get_silero_vad():
    global _silero_vad
    if _silero_vad is None:
        from silero_vad import load_silero_vad
        _silero_vad = load_silero_vad()
    return _silero_vad


def _energy_trim(samples, rate: int, pad_ms: int):
    """Dependency-free fallback: crop edges quieter than -40 dB below the peak."""
    import numpy as np

    abs_s = np.abs(samples)
    peak = float(abs_s.max()) if abs_s.size else 0.0
    if peak <= 0:
        return samples
    above = np.where(abs_s >= peak * 0.01)[0]  # 0.01 == -40 dB
    if above.size == 0:
        return samples
    pad = int(rate * pad_ms / 1000)
    start = max(0, int(above[0]) - pad)
    end = min(samples.size, int(above[-1]) + 1 + pad)
    return samples[start:end]


def _resample_linear(samples, src_rate: int, dst_rate: int):
    """Cheap linear resample — good enough for VAD framing."""
    import numpy as np

    if src_rate == dst_rate:
        return samples.astype("float32")
    n = max(1, round(samples.size * dst_rate / src_rate))
    return np.interp(
        np.linspace(0, 1, n, endpoint=False),
        np.linspace(0, 1, samples.size, endpoint=False),
        samples,
    ).astype("float32")


def _speech_spans(samples, rate: int):
    """Speech segments as (start_sec, end_sec) via Silero VAD (wants 16 kHz mono)."""
    import torch
    from silero_vad import get_speech_timestamps

    vad_audio = _resample_linear(samples, rate, 16000)
    spans = get_speech_timestamps(
        torch.from_numpy(vad_audio), _get_silero_vad(), sampling_rate=16000
    )
    return [(s["start"] / 16000, s["end"] / 16000) for s in spans]


def trim_to_speech(samples, rate: int, pad_ms: int = 60):
    """Crop to [first speech .. last speech] (+pad_ms), removing edge artifacts."""
    import numpy as np

    samples = np.asarray(samples, dtype="float32").reshape(-1)
    if samples.size == 0:
        return samples
    try:
        spans = _speech_spans(samples, rate)
        if not spans:
            return _energy_trim(samples, rate, pad_ms)
        pad = pad_ms / 1000
        start = max(0, int((spans[0][0] - pad) * rate))
        end = min(samples.size, int((spans[-1][1] + pad) * rate))
        return samples[start:end] if end > start else samples
    except ImportError:
        return _energy_trim(samples, rate, pad_ms)
    except Exception as error:  # noqa: BLE001 — never let trimming kill a run
        print(f"  trim skipped ({type(error).__name__}: {error})")
        return samples


def crop_after_carrier(samples, rate: int, pad_ms: int):
    """From a 'carrier, word.' clip, return just the word (first speech after the
    carrier), or None if the carrier and word can't be told apart confidently."""
    import numpy as np

    samples = np.asarray(samples, dtype="float32").reshape(-1)
    if samples.size == 0:
        return None
    try:
        spans = _speech_spans(samples, rate)
    except Exception:  # noqa: BLE001 — VAD missing/failed; caller falls back
        return None
    if len(spans) < 2:
        return None  # merged into one segment — not confident enough to crop
    start_sec, end_sec = spans[1]  # carrier is spans[0]; the word follows
    pad = pad_ms / 1000
    start = max(0, int((start_sec - pad) * rate))
    end = min(samples.size, int((end_sec + pad) * rate))
    return samples[start:end] if end > start else None


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
    """Write audio/manifest.json as key -> {file, reviewed}.

    Preserves the `reviewed` flag of clips already in a prior manifest (so
    regenerating audio never silently un-reviews it); apply_reviews.py sets it
    true when it promotes a reviewed candidate. New clips start unreviewed.
    """
    manifest_path = out_dir / "manifest.json"
    prior: dict = {}
    if manifest_path.exists():
        try:
            prior = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            prior = {}

    def was_reviewed(key: str) -> bool:
        entry = prior.get(key)
        return bool(entry.get("reviewed")) if isinstance(entry, dict) else False

    manifest = {}
    for name in sorted(p.name for p in out_dir.glob("*.mp3")):
        key = name.removesuffix(".mp3")
        manifest[key] = {"file": name, "reviewed": was_reviewed(key)}
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return len(manifest)


# Candidate review: three settings profiles per word so you can A/B them in the
# app and keep the best. Each profile's gen_kwargs feed make_synthesize.
CANDIDATE_PROFILES = [
    {"id": "greedy", "gen_kwargs": {"do_sample": False}},
    {"id": "balanced", "gen_kwargs": {"do_sample": True, "top_p": 0.8, "temperature": 0.7}},
    {"id": "expressive", "gen_kwargs": {"do_sample": True, "top_p": 0.95, "temperature": 1.0}},
]


def write_candidates_manifest(out_dir: Path, texts: dict[str, str]) -> int:
    """Write candidates/manifest.json: key -> {text, variants:[{id, file}]}."""
    manifest: dict[str, dict] = {}
    for key, text in sorted(texts.items(), key=lambda kv: kv[1]):
        variants = [
            {"id": p["id"], "file": f"{key}-{p['id']}.mp3"}
            for p in CANDIDATE_PROFILES
            if (out_dir / f"{key}-{p['id']}.mp3").exists()
        ]
        if variants:
            manifest[key] = {"text": text, "variants": variants}
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return len(manifest)


def run_candidates(args, texts: dict[str, str], ffmpeg: str) -> None:
    """Generate CANDIDATE_PROFILES variants per word for in-app A/B review."""
    out_dir = args.out / "candidates"
    out_dir.mkdir(parents=True, exist_ok=True)

    def variant_path(key: str, profile_id: str) -> Path:
        return out_dir / f"{key}-{profile_id}.mp3"

    pending = {
        key: text
        for key, text in texts.items()
        if args.force or any(not variant_path(key, p["id"]).exists() for p in CANDIDATE_PROFILES)
    }
    if args.limit is not None:
        pending = dict(list(pending.items())[: args.limit])
    profile_ids = ", ".join(p["id"] for p in CANDIDATE_PROFILES)
    print(f"candidates mode: {len(CANDIDATE_PROFILES)} profiles ({profile_ids})")
    print(f"{len(pending)} words to (re)generate, {len(texts) - len(pending)} already complete")

    if pending:
        device = args.device or pick_device()
        model, normalize = load_model(
            args.model, device, explicit_device=args.device is not None
        )
        synths = {
            p["id"]: make_synthesize(
                model, normalize, args.qwen_speaker, args.qwen_instruct,
                gen_kwargs=p["gen_kwargs"], end_punct=args.end_punct,
                carrier=args.carrier, carrier_word=args.carrier_word,
                carrier_max_chars=args.carrier_max_chars, carrier_pad_ms=args.trim_pad_ms,
            )
            for p in CANDIDATE_PROFILES
        }
        for i, (key, text) in enumerate(pending.items(), 1):
            print(f"[{i}/{len(pending)}] {text}")
            for p in CANDIDATE_PROFILES:
                target = variant_path(key, p["id"])
                if target.exists() and not args.force:
                    continue
                samples, rate = synths[p["id"]](text)
                if args.trim:
                    samples = trim_to_speech(samples, rate, args.trim_pad_ms)
                write_mp3(samples, rate, target, ffmpeg)
                print(f"    {p['id']}")

    count = write_candidates_manifest(out_dir, texts)
    total_kb = sum(p.stat().st_size for p in out_dir.glob("*.mp3")) // 1024
    print(f"candidates/manifest.json lists {count} words ({total_kb} KiB) in {out_dir}")


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
    parser.add_argument("--no-end-punct", dest="end_punct", action="store_false",
                        help="don't append a full stop to unpunctuated inputs "
                             "(the stop cue curbs hallucinated words on short clips)")
    parser.add_argument("--max-new-tokens", type=int, default=None,
                        help="cap generated audio length (also curbs runaway short clips)")
    parser.add_argument("--gen-kwarg", action="append", metavar="KEY=VALUE", default=[],
                        help="extra generate kwarg, e.g. --gen-kwarg do_sample=false "
                             "or --gen-kwarg top_p=0.8 (repeatable)")
    parser.add_argument("--no-carrier", dest="carrier", action="store_false",
                        help="disable the carrier-phrase trick for ultra-short words")
    parser.add_argument("--carrier-word", default="Mana",
                        help="lead-in that gives short clips momentum (default: Mana)")
    parser.add_argument("--carrier-max-chars", type=int, default=4,
                        help="treat single words up to this length as short (default: 4)")
    parser.set_defaults(end_punct=True, carrier=True)
    parser.add_argument("--yandex-host", default="tts.api.yandexcloud.kz",
                        help="SpeechKit host (KZ default; RU is tts.api.cloud.yandex.net)")
    parser.add_argument("--yandex-voice", default="nigora", help="Yandex voice (default: nigora)")
    parser.add_argument("--yandex-lang", default="uz-UZ", help="Yandex language tag")
    parser.add_argument("--no-trim", dest="trim", action="store_false",
                        help="keep raw output; skip trimming edge non-speech")
    parser.add_argument("--trim-pad-ms", type=int, default=60,
                        help="silence kept around the speech span when trimming")
    parser.add_argument("--candidates", action="store_true",
                        help="generate 3 settings variants per word into "
                             "public/audio/candidates/ for in-app A/B review")
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

    if args.candidates:
        if args.backend != "local":
            sys.exit("--candidates only applies to the local backend")
        run_candidates(args, texts, ffmpeg)
        return

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
            gen_kwargs = {}
            for item in args.gen_kwarg:
                if "=" not in item:
                    sys.exit(f"--gen-kwarg expects KEY=VALUE, got {item!r}")
                key, value = item.split("=", 1)
                gen_kwargs[key.strip()] = coerce_gen_value(value.strip())
            if args.max_new_tokens is not None:
                gen_kwargs["max_new_tokens"] = args.max_new_tokens
            device = args.device or pick_device()
            synthesize = load_synthesizer(
                args.model, device, args.qwen_speaker, args.qwen_instruct,
                explicit_device=args.device is not None,
                gen_kwargs=gen_kwargs, end_punct=args.end_punct,
                carrier=args.carrier, carrier_word=args.carrier_word,
                carrier_max_chars=args.carrier_max_chars,
                carrier_pad_ms=args.trim_pad_ms,
            )

        for i, (key, text) in enumerate(pending.items(), 1):
            samples, rate = synthesize(text)
            note = ""
            if args.trim:
                before = len(samples) / rate
                samples = trim_to_speech(samples, rate, args.trim_pad_ms)
                note = f"  ({before:.2f}s→{len(samples) / rate:.2f}s)"
            print(f"[{i}/{len(pending)}] {text}{note}")
            write_mp3(samples, rate, args.out / f"{key}.mp3", ffmpeg)

    count = write_manifest(args.out)
    total_kb = sum(p.stat().st_size for p in args.out.glob("*.mp3")) // 1024
    print(f"manifest.json lists {count} clips ({total_kb} KiB total) in {args.out}")


if __name__ == "__main__":
    # Die quietly when piped into head etc.
    import signal

    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    main()
