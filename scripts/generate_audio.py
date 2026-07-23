#!/usr/bin/env python3
"""Generate prebuilt Uzbek audio for Lugʻatcha.

Enumerates every spoken string in public/data (word entries, story sentences,
roleplay turns, lesson audio) plus the counting-quiz number readings generated
in code, synthesises each one with Yandex SpeechKit, and writes
content-addressed MP3s plus public/audio/yandex/manifest.json. The app looks
clips up by the same text hash (src/audio/key.ts) and falls back to the Web
Speech API for anything missing, so partial runs are safe.

Alongside each normal-speed clip a 0.75× time-stretched version is written
(e.g. 3f1a.mp3 → 3f1a_slow.mp3). The manifest records it as "slowFile" so
the app can play it on a second tap of the speaker button.

The manifest is rewritten after every clip, so a run is safe to quit anytime.
It stays in sync with disk both ways: deleting a clip file drops its entry on
the next save, and deleting an entry by hand deletes the clip on the next run.

Setup (once):
    git clone https://github.com/tomnewport/Lugatcha.git
    cd Lugatcha
    brew install uv ffmpeg

Credentials are read from .env (SecretKey / Folder) or environment vars
(YANDEX_API_KEY / YANDEX_FOLDER_ID).

Usage:
    uv run python scripts/generate_audio.py --dry-run       # list texts and exit
    uv run python scripts/generate_audio.py --limit 1       # smoke test
    uv run python scripts/generate_audio.py                 # generate everything missing
    uv run python scripts/generate_audio.py --force         # regenerate all clips
    uv run python scripts/generate_audio.py --self-test     # verify hash parity only
    # Russia cloud instead of Kazakhstan:
    #   --yandex-host tts.api.cloud.yandex.net

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
import unicodedata
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "public" / "data"
AUDIO_ROOT = REPO_ROOT / "public" / "audio"
FIXTURES = REPO_ROOT / "tests" / "audio-key-fixtures.json"

# ---------------------------------------------------------------------------
# Text keying — MUST stay identical to src/audio/key.ts.
# tests/audio-key-fixtures.json pins both implementations; run --self-test
# after touching either side.
# ---------------------------------------------------------------------------

APOSTROPHES = re.compile(r"[''ʻʼ`´]")
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


# Surrounding punctuation trimmed + lowercased: the canonical spoken form of a
# single tapped word. MUST mirror src/exercises/validate.ts:spokenWordForm so a
# word tapped in the app resolves to the clip generated here.
_EDGE_PUNCT = " \t\r\n.,!?;:\"«»()[]{}—–…·+-“”"


def spoken_word_form(token: str) -> str:
    return unicodedata.normalize("NFC", token).strip(_EDGE_PUNCT).lower()


def _has_letter(text: str) -> bool:
    return any(ch.isalpha() for ch in text)


# ---------------------------------------------------------------------------
# Uzbek cardinals — MUST stay identical to src/exercises/numbers.ts.
#
# The counting quiz (src/components/school/CountingQuiz.vue) speaks numbers it
# generates at runtime via numberToUzbek(), so those readings live in code, not
# in public/data — without enumerating them here the whole 0–100 range falls
# through to the Web Speech fallback. NUMBER_SELF_TEST pins a few anchors (the
# same ones tests/numbers.spec.ts checks) so this port can't silently drift.
# ---------------------------------------------------------------------------

_ONES = ["nol", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"]
# Index = the tens digit; index 1 is o'n (10), 2 is yigirma (20), …
_TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"]

# generateCountingQuiz defaults to max=100 and CountingQuiz.vue uses that
# default, so the quiz never speaks a number outside 0–100 inclusive.
COUNTING_QUIZ_MAX = 100

NUMBER_SELF_TEST = {
    0: "nol",
    7: "yetti",
    10: "o'n",
    11: "o'n bir",
    21: "yigirma bir",
    99: "to'qson to'qqiz",
    100: "yuz",
}


def number_to_uzbek(n: int) -> str:
    """Render 0–9999 as its spoken Uzbek cardinal (mirrors numberToUzbek)."""
    if not (0 <= n <= 9999):
        raise ValueError(f"number_to_uzbek supports 0–9999, got {n}")
    if n == 0:
        return "nol"
    parts: list[str] = []
    thousands, hundreds, tens, ones = n // 1000, (n % 1000) // 100, (n % 100) // 10, n % 10
    if thousands:
        if thousands > 1:
            parts.append(number_to_uzbek(thousands))
        parts.append("ming")
    if hundreds:
        if hundreds > 1:
            parts.append(_ONES[hundreds])
        parts.append("yuz")
    if tens:
        parts.append(_TENS[tens])
    if ones:
        parts.append(_ONES[ones])
    return " ".join(parts)


def counting_quiz_texts() -> list[str]:
    """Every Uzbek number reading the counting quiz can speak (0–max inclusive)."""
    return [number_to_uzbek(n) for n in range(COUNTING_QUIZ_MAX + 1)]


def self_test() -> None:
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    failures = [
        (text, expected, audio_key(text))
        for text, expected in fixtures.items()
        if audio_key(text) != expected
    ]
    for text, expected, got in failures:
        print(f"MISMATCH {text!r}: expected {expected}, got {got}", file=sys.stderr)
    number_failures = [
        (n, expected, number_to_uzbek(n))
        for n, expected in NUMBER_SELF_TEST.items()
        if number_to_uzbek(n) != expected
    ]
    for n, expected, got in number_failures:
        print(f"MISMATCH number {n}: expected {expected!r}, got {got!r}", file=sys.stderr)
    if failures or number_failures:
        sys.exit(1)
    print(
        f"self-test OK — {len(fixtures)} fixtures match src/audio/key.ts, "
        f"{len(NUMBER_SELF_TEST)} number readings match src/exercises/numbers.ts"
    )


# ---------------------------------------------------------------------------
# Inventory: every string the app can speak aloud
# ---------------------------------------------------------------------------


def collect_texts() -> dict[str, str]:
    """Returns key -> text for everything the app can speak, first occurrence wins.

    Two tiers:
      * Whole strings — word/phrase entries, story sentences, roleplay turns and
        lesson audio — spoken when a card, sentence or turn is played.
      * Individual words — every token of a phrase/entry in its `spoken_word_form`
        (punctuation trimmed, lowercased). Each Uzbek word in the app is tappable
        for audio (see UzbekWord.vue), so without these a tap falls through to the
        Web Speech fallback. public/data/spoken-words.json captures this set and is
        unioned in so words can be curated or added by hand.
    """
    manifest = json.loads((DATA_DIR / "manifest.json").read_text(encoding="utf-8"))
    phrases: list[str] = []  # multi-word, spoken as a unit
    entries: list[str] = []  # vocabulary entries (may be single or multi word)

    for name in manifest["words"]:
        for word in json.loads((DATA_DIR / "words" / f"{name}.json").read_text(encoding="utf-8")):
            entries.append(word["uzbek"])

    for name in manifest["stories"]:
        stories = json.loads((DATA_DIR / "stories" / f"{name}.json").read_text(encoding="utf-8"))
        for story in stories:
            phrases.extend(sentence["uzbek"] for sentence in story["sentences"])

    for name in manifest["roleplay"]:
        roleplays = json.loads((DATA_DIR / "roleplay" / f"{name}.json").read_text(encoding="utf-8"))
        for roleplay in roleplays:
            for variant in roleplay["variants"]:
                phrases.extend(turn["uzbek"] for turn in variant["turns"])

    # Language School lessons: spoken examples and exercise audio
    lessons_dir = DATA_DIR / "lessons"
    if lessons_dir.exists():
        for meta in json.loads((lessons_dir / "index.json").read_text(encoding="utf-8")):
            lesson = json.loads((lessons_dir / f"{meta['id']}.json").read_text(encoding="utf-8"))
            for section in lesson["sections"]:
                phrases.extend(ex["uzbek"] for ex in section.get("examples", []))
            for exercise in lesson["exercises"]:
                if exercise.get("promptUzbek"):
                    phrases.append(exercise["promptUzbek"])
                if exercise["engine"] == "build":
                    joiner = exercise.get("joiner", " ")
                    phrases.append(exercise.get("audioText") or joiner.join(exercise["tokens"]))

    # Vocabulary groups (School): each groups/<id>.json embeds its own word
    # gallery (spoken per word in GroupReview) and an `article` of lesson-style
    # sections (examples spoken in LessonSectionCard). These live outside
    # public/data/words, so scan them here too.
    groups_dir = DATA_DIR / "groups"
    if groups_dir.exists():
        for meta in json.loads((groups_dir / "index.json").read_text(encoding="utf-8")):
            group = json.loads((groups_dir / f"{meta['id']}.json").read_text(encoding="utf-8"))
            entries.extend(word["uzbek"] for word in group.get("words", []))
            for section in group.get("article", []):
                phrases.extend(ex["uzbek"] for ex in section.get("examples", []))

    # Counting quiz: number readings are generated in code, not in public/data,
    # so enumerate the range the quiz can speak (mirrors numbers.ts).
    phrases.extend(counting_quiz_texts())

    collected: dict[str, str] = {}

    def add(text: str) -> None:
        if text:
            collected.setdefault(audio_key(text), normalize_spoken_text(text))

    # Tier 1: whole strings, exactly as a card/sentence/turn is played.
    for text in [*entries, *phrases]:
        add(text)

    # Tier 2: each tappable word, in its canonical spoken form. Multi-word vocab
    # entries are also added whole so the flashcard tap on the full entry resolves.
    for text in [*phrases, *entries]:
        for token in text.split():
            word = spoken_word_form(token)
            if word and _has_letter(word):
                add(word)
    for entry in entries:
        whole = spoken_word_form(entry)
        if " " in whole and _has_letter(whole):
            add(whole)

    # Optional curated/extra words.
    spoken_path = DATA_DIR / "spoken-words.json"
    if spoken_path.exists():
        for word in json.loads(spoken_path.read_text(encoding="utf-8")).get("words", []):
            form = spoken_word_form(word)
            if form and _has_letter(form):
                add(form)

    return collected


# ---------------------------------------------------------------------------
# Synthesis: Yandex SpeechKit gRPC v3
# ---------------------------------------------------------------------------


def _load_dotenv(path: Path = REPO_ROOT / ".env") -> None:
    """Load KEY=VALUE pairs from .env without overriding existing env vars."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip().removeprefix("export ").strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value


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
    """Returns synthesize(text) -> mp3_bytes backed by Yandex SpeechKit gRPC v3.

    Uses the gRPC v3 API which returns MP3 directly — no ffmpeg decode/re-encode.

    The KZ installation exposes gRPC at tts.api.yandexcloud.kz:443 even though
    the REST v1 endpoint (speech/v1/tts:synthesize) returns 405 for KZ accounts.
    """
    try:
        import grpc
        from yandex.cloud.ai.tts.v3 import tts_pb2
        from yandex.cloud.ai.tts.v3.tts_service_pb2_grpc import SynthesizerStub
    except ImportError:
        sys.exit(
            "yandexcloud and grpcio are required:\n"
            "  uv add yandexcloud grpcio"
        )

    grpc_host = host if ":" in host else f"{host}:443"

    def _metadata_callback(context, callback):
        callback([("authorization", f"Api-Key {api_key}")], None)

    creds = grpc.composite_channel_credentials(
        grpc.ssl_channel_credentials(),
        grpc.metadata_call_credentials(_metadata_callback),
    )
    channel = grpc.secure_channel(grpc_host, creds)
    client = SynthesizerStub(channel)

    def synthesize(text: str) -> bytes:
        req = tts_pb2.UtteranceSynthesisRequest(
            text=text,
            hints=[tts_pb2.Hints(voice=voice)],
            output_audio_spec=tts_pb2.AudioFormatOptions(
                container_audio=tts_pb2.ContainerAudio(
                    container_audio_type=tts_pb2.ContainerAudio.MP3
                )
            ),
        )
        try:
            chunks = list(client.UtteranceSynthesis(req, timeout=60))
        except Exception as error:
            sys.exit(f"Yandex SpeechKit gRPC request failed: {error}")
        return b"".join(c.audio_chunk.data for c in chunks)

    return synthesize


# ---------------------------------------------------------------------------
# Post-processing: 0.75× slow version via ffmpeg atempo
# ---------------------------------------------------------------------------


def make_slow_mp3(src: Path, target: Path, ffmpeg: str, speed: float = 0.75) -> None:
    """Time-stretch an MP3 to `speed` (pitch-preserving) and write to target."""
    subprocess.run(
        [ffmpeg, "-y", "-loglevel", "error", "-i", str(src),
         "-filter:a", f"atempo={speed}", str(target)],
        check=True,
    )


# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------


def write_manifest(out_dir: Path) -> int:
    """Write audio/manifest.json as key -> {file, slowFile?, reviewed}.

    Preserves the `reviewed` flag of clips already in a prior manifest.
    Includes a `slowFile` entry when a matching <key>_slow.mp3 exists.
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
    for mp3 in sorted(out_dir.glob("*.mp3"), key=lambda p: p.name):
        if mp3.stem.endswith("_slow"):
            continue  # slow clips are referenced via their parent entry's slowFile
        key = mp3.stem
        entry: dict = {"file": mp3.name, "reviewed": was_reviewed(key)}
        slow_path = out_dir / f"{key}_slow.mp3"
        if slow_path.exists():
            entry["slowFile"] = slow_path.name
        manifest[key] = entry
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return len(manifest)


def _read_manifest(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def prune_main_orphans(out_dir: Path) -> int:
    """Delete <key>.mp3 and <key>_slow.mp3 files whose manifest entry was removed.

    The reverse direction (file deleted -> entry dropped) is handled by
    write_manifest rebuilding from disk. A missing or empty manifest is treated
    as "adopt whatever is on disk", never as "delete everything".
    """
    manifest = _read_manifest(out_dir / "manifest.json")
    if not manifest:
        return 0
    keys = set(manifest)
    removed = 0
    for mp3 in out_dir.glob("*.mp3"):
        # slow clips belong to their parent key
        parent_key = mp3.stem[:-5] if mp3.stem.endswith("_slow") else mp3.stem
        if parent_key not in keys:
            mp3.unlink()
            removed += 1
            print(f"  pruned {mp3.name} (removed from manifest)")
    return removed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--out", type=Path, default=AUDIO_ROOT / "yandex",
                        help="output directory (default: public/audio/yandex)")
    parser.add_argument("--yandex-host", default="tts.api.yandexcloud.kz",
                        help="SpeechKit host (KZ default; RU is tts.api.cloud.yandex.net)")
    parser.add_argument("--yandex-voice", default="nigora", help="Yandex voice (default: nigora)")
    parser.add_argument("--yandex-lang", default="uz-UZ", help="Yandex language tag")
    parser.add_argument("--no-slow", dest="slow", action="store_false",
                        help="skip generating 0.75× slow-speed clips")
    parser.set_defaults(slow=True)
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
    pruned = prune_main_orphans(args.out)
    if pruned:
        print(f"pruned {pruned} clips removed from the manifest")

    pending_normal = {
        key: text
        for key, text in texts.items()
        if args.force or not (args.out / f"{key}.mp3").exists()
    }
    if args.limit is not None:
        pending_normal = dict(list(pending_normal.items())[: args.limit])
    print(f"{len(pending_normal)} normal clips to generate, "
          f"{len(texts) - len(pending_normal)} already present")

    if pending_normal:
        _load_dotenv()
        api_key = os.environ.get("YANDEX_API_KEY") or os.environ.get("SecretKey")
        folder_id = os.environ.get("YANDEX_FOLDER_ID") or os.environ.get("Folder")
        if not api_key or not folder_id:
            sys.exit(
                "Set YANDEX_API_KEY and YANDEX_FOLDER_ID\n"
                "(or SecretKey and Folder in a .env file).\n"
                "Create a service-account API key (scope yc.ai.speechkitTts.execute) "
                "in your Yandex Cloud console."
            )
        print(f"using Yandex SpeechKit at {args.yandex_host} "
              f"(voice={args.yandex_voice}, lang={args.yandex_lang})…")
        synthesize = load_yandex_synthesizer(
            args.yandex_host, api_key, folder_id, args.yandex_voice, args.yandex_lang
        )

        for i, (key, text) in enumerate(pending_normal.items(), 1):
            print(f"[{i}/{len(pending_normal)}] {text}")
            mp3_path = args.out / f"{key}.mp3"
            mp3_path.write_bytes(synthesize(text))
            if args.slow:
                slow_path = args.out / f"{key}_slow.mp3"
                make_slow_mp3(mp3_path, slow_path, ffmpeg)
            write_manifest(args.out)

    # Sweep: generate slow clips for any existing normal clip that's missing one.
    if args.slow:
        missing_slow = [
            mp3 for mp3 in args.out.glob("*.mp3")
            if not mp3.stem.endswith("_slow")
            and not (args.out / f"{mp3.stem}_slow.mp3").exists()
        ]
        if missing_slow:
            print(f"generating slow versions for {len(missing_slow)} existing clips…")
            for mp3 in sorted(missing_slow, key=lambda p: p.name):
                slow_path = args.out / f"{mp3.stem}_slow.mp3"
                make_slow_mp3(mp3, slow_path, ffmpeg)
                print(f"  {slow_path.name}")

    count = write_manifest(args.out)
    total_kb = sum(p.stat().st_size for p in args.out.glob("*.mp3")) // 1024
    print(f"manifest.json lists {count} clips ({total_kb} KiB total) in {args.out}")


if __name__ == "__main__":
    # Die quietly when piped into head etc.
    import signal

    signal.signal(signal.SIGPIPE, signal.SIG_DFL)
    main()
