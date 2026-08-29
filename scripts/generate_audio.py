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
TAXI_CLAUSES = REPO_ROOT / "tests" / "taxi-clauses.json"

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
# Two games speak numbers generated at runtime, so those readings live in code
# rather than public/data and would otherwise fall through to the Web Speech
# fallback entirely:
#
#   * the counting quiz (src/components/school/CountingQuiz.vue) reads 0–100
#     whole, and
#   * Bazar hero (src/exercises/bazar.ts) reads soʻm prices into the tens of
#     millions. Those cannot be recorded whole — there are far too many — so
#     the game stitches the price together from one clip per word, which the
#     tier-2 pass below already records. All it needs from here are the scale
#     words no small number contains ("ming", "million", "milliard").
#     Its *bonus* round is the exception: it asks the learner to recognise a
#     number by ear, which stitched words cannot teach, so its hundred fixed
#     prices are enumerated and recorded whole.
#
# NUMBER_SELF_TEST pins a few anchors (the same ones tests/numbers.spec.ts
# checks) so this port can't silently drift.
# ---------------------------------------------------------------------------

_ONES = ["nol", "bir", "ikki", "uch", "to'rt", "besh", "olti", "yetti", "sakkiz", "to'qqiz"]
# Index = the tens digit; index 1 is o'n (10), 2 is yigirma (20), …
_TENS = ["", "o'n", "yigirma", "o'ttiz", "qirq", "ellik", "oltmish", "yetmish", "sakson", "to'qson"]
# Scale word per group of three digits, smallest first. Only "ming" drops its
# "bir" (ming = 1000, but *bir* million = 1 000 000).
_SCALES = ["", "ming", "million", "milliard"]

MAX_UZBEK_CARDINAL = 10 ** (len(_SCALES) * 3) - 1

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
    1000: "ming",
    9999: "to'qqiz ming to'qqiz yuz to'qson to'qqiz",
    15000: "o'n besh ming",
    230000: "ikki yuz o'ttiz ming",
    1500000: "bir million besh yuz ming",
    90000000: "to'qson million",
}


def _group_tokens(n: int) -> list[str]:
    """Render 1–999 — the body of one three-digit group — as its spoken words."""
    tokens: list[str] = []
    hundreds, tens, ones = n // 100, (n % 100) // 10, n % 10
    if hundreds:
        if hundreds > 1:
            tokens.append(_ONES[hundreds])
        tokens.append("yuz")
    if tens:
        tokens.append(_TENS[tens])
    if ones:
        tokens.append(_ONES[ones])
    return tokens


def uzbek_cardinal_tokens(n: int) -> list[str]:
    """The spoken Uzbek cardinal, one word per element (mirrors uzbekCardinalTokens)."""
    if not (0 <= n <= MAX_UZBEK_CARDINAL):
        raise ValueError(f"uzbek_cardinal_tokens supports 0–{MAX_UZBEK_CARDINAL}, got {n}")
    if n == 0:
        return ["nol"]
    tokens: list[str] = []
    for scale in range(len(_SCALES) - 1, -1, -1):
        group = (n // 10 ** (scale * 3)) % 1000
        if not group:
            continue
        # A lone "bir" is dropped before ming only — "bir million" keeps its bir.
        if not (group == 1 and scale == 1):
            tokens.extend(_group_tokens(group))
        if scale:
            tokens.append(_SCALES[scale])
    return tokens


def number_to_uzbek(n: int) -> str:
    """Render 0–9999 as its spoken Uzbek cardinal (mirrors numberToUzbek)."""
    if not (0 <= n <= 9999):
        raise ValueError(f"number_to_uzbek supports 0–9999, got {n}")
    return " ".join(uzbek_cardinal_tokens(n))


def counting_quiz_texts() -> list[str]:
    """Every Uzbek number reading the counting quiz can speak (0–max inclusive)."""
    return [number_to_uzbek(n) for n in range(COUNTING_QUIZ_MAX + 1)]


# The bonus round's fixed price list — MUST stay identical to BONUS_PRICES in
# src/exercises/bazar.ts.
BAZAR_BONUS_SIGNIFICANDS = [
    10, 12, 15, 18, 20, 23, 25, 28, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90,
]
BAZAR_BONUS_EXPONENTS = [2, 3, 4, 5, 6]


def bazar_texts() -> list[str]:
    """What Bazar hero speaks: the scale words it stitches with, and its bonus prices."""
    # Stitching words: every cardinal word the game's register can offer. Most
    # already fall out of the 0–100 quiz range; the scale words do not.
    words = [*_ONES[1:], *_TENS[1:], "yuz", *_SCALES[1:]]
    prices = [
        significand * 10**exponent
        for exponent in BAZAR_BONUS_EXPONENTS
        for significand in BAZAR_BONUS_SIGNIFICANDS
    ]
    return [*words, *(" ".join(uzbek_cardinal_tokens(price)) for price in prices)]


# ---------------------------------------------------------------------------
# Taxi driver — MUST stay identical to allSpokenClauses() in
# src/exercises/taxi.ts.
#
# The passenger's directions are generated at runtime, but they are assembled
# out of a fixed set of whole clauses ("Birinchi koʻchadan chapga buriling.")
# precisely so that every one of them can be recorded as a real sentence rather
# than stitched together word by word. Each kind of step has three or four
# wordings, because directions in the street are not formulaic; the set is
# still finite, and self_test() pins this list against the TypeScript one via
# tests/taxi-clauses.json. Add a wording or a landmark there and it has to be
# added here too, the fixture regenerated, and the generator re-run.
# ---------------------------------------------------------------------------

TAXI_ORDINALS = ["birinchi", "ikkinchi", "uchinchi", "toʻrtinchi"]
TAXI_CARDINALS = ["bir", "ikki", "uch", "toʻrt", "besh"]
# The counted forms: -ta on the number, irregular only at bir → bitta.
TAXI_COUNTERS = ["bitta", "ikkita", "uchta", "toʻrtta", "beshta"]
TAXI_SIDE_TO = {"left": "chapga", "right": "oʻngga"}
TAXI_SIDE_BARE = {"left": "chap", "right": "oʻng"}
TAXI_SIDE_ON = {"left": "chapdagi", "right": "oʻngdagi"}
# Landmark names as the passenger says them, capitalised — every clause that
# names one starts with it (LANDMARKS in src/exercises/taxi.ts).
TAXI_LANDMARKS = [
    "Kasalxona",
    "Mehmonxona",
    "Muzey",
    "Bank",
    "Kutubxona",
    "Restoran",
    "Kafe",
    "Choyxona",
    "Bozor",
    "Bogʻ",
    "Masjid",
    "Maktab",
    "Politsiya",
    "Vokzal",
    "Metro",
    "Teatr",
]


def _taxi_clause(words: list[str]) -> str:
    """One clause: capitalise the opening word, and close the sentence."""
    head, *rest = words
    return " ".join([head[:1].upper() + head[1:], *rest]) + "."


def taxi_texts() -> list[str]:
    """Every clause a passenger in Taxi driver can say, in every wording."""
    clauses: list[str] = []
    for side in ("left", "right"):
        to = TAXI_SIDE_TO[side]
        for ordinal in TAXI_ORDINALS:
            clauses.append(_taxi_clause([ordinal, "koʻchadan", to, "buriling"]))
            clauses.append(_taxi_clause([TAXI_SIDE_ON[side], ordinal, "koʻchaga", "buriling"]))
            clauses.append(_taxi_clause([ordinal, "chorrahadan", to, "qayriling"]))
            clauses.append(_taxi_clause([ordinal, "burilishdan", to, "buriling"]))
        clauses.append(_taxi_clause([to, "buriling"]))
        clauses.append(_taxi_clause([TAXI_SIDE_BARE[side], "tomonga", "buriling"]))
        clauses.append(_taxi_clause([to, "qayriling"]))
        clauses.append(_taxi_clause(["keyin", to, "buriling"]))
        for place in TAXI_LANDMARKS:
            clauses.append(_taxi_clause([f"{place}da", to, "buriling"]))
            clauses.append(_taxi_clause([place, "yonidan", to, "buriling"]))
            clauses.append(_taxi_clause([f"{place}ga", "yetganda", to, "buriling"]))
    for cardinal, counter in zip(TAXI_CARDINALS, TAXI_COUNTERS):
        clauses.append(_taxi_clause(["toʻgʻriga", cardinal, "kvartal", "yuring"]))
        clauses.append(_taxi_clause([counter, "kvartal", "toʻgʻri", "boring"]))
        clauses.append(_taxi_clause([cardinal, "kvartal", "toʻgʻriga", "haydang"]))
    for place in TAXI_LANDMARKS:
        clauses.append(_taxi_clause([f"{place}gacha", "yuring"]))
        clauses.append(_taxi_clause([f"{place}ga", "boring"]))
        clauses.append(_taxi_clause([f"{place}gacha", "toʻgʻri", "haydang"]))
    return clauses


def self_test() -> None:
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))
    failures = [
        (text, expected, audio_key(text))
        for text, expected in fixtures.items()
        if audio_key(text) != expected
    ]
    for text, expected, got in failures:
        print(f"MISMATCH {text!r}: expected {expected}, got {got}", file=sys.stderr)
    # Anchored against the general renderer, since the list reaches past the
    # 0–9999 window number_to_uzbek deliberately keeps.
    number_failures = [
        (n, expected, " ".join(uzbek_cardinal_tokens(n)))
        for n, expected in NUMBER_SELF_TEST.items()
        if " ".join(uzbek_cardinal_tokens(n)) != expected
    ]
    for n, expected, got in number_failures:
        print(f"MISMATCH number {n}: expected {expected!r}, got {got!r}", file=sys.stderr)
    # The taxi's clauses are written out twice — here and in taxi.ts — so both
    # are pinned to one list. Regenerate it from the TypeScript side (see the
    # note at the top of tests/taxi-clauses.json) if a wording changes.
    taxi_expected = json.loads(TAXI_CLAUSES.read_text(encoding="utf-8"))["clauses"]
    taxi_got = sorted(taxi_texts())
    taxi_ok = taxi_got == sorted(taxi_expected)
    if not taxi_ok:
        missing = sorted(set(taxi_expected) - set(taxi_got))
        extra = sorted(set(taxi_got) - set(taxi_expected))
        for text in missing:
            print(f"MISSING taxi clause {text!r}", file=sys.stderr)
        for text in extra:
            print(f"UNEXPECTED taxi clause {text!r}", file=sys.stderr)

    if failures or number_failures or not taxi_ok:
        sys.exit(1)
    print(
        f"self-test OK — {len(fixtures)} fixtures match src/audio/key.ts, "
        f"{len(NUMBER_SELF_TEST)} number readings match src/exercises/numbers.ts, "
        f"{len(taxi_got)} taxi clauses match src/exercises/taxi.ts"
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

    # Counting quiz, Bazar hero and Taxi driver: these speak strings generated
    # in code rather than stored in public/data, so enumerate what each of them
    # can say (mirrors numbers.ts, bazar.ts and taxi.ts).
    phrases.extend(counting_quiz_texts())
    phrases.extend(bazar_texts())
    phrases.extend(taxi_texts())

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
