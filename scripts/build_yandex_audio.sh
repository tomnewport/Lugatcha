#!/usr/bin/env bash
# Generate Uzbek audio with Yandex SpeechKit (Nigora) into public/audio/yandex/.
# Reads SecretKey from .env in the repo root.
# Usage:
#   ./scripts/build_yandex_audio.sh              # generate everything missing
#   ./scripts/build_yandex_audio.sh --limit 5    # try 5 clips first
#   ./scripts/build_yandex_audio.sh --force      # regenerate all clips
set -euo pipefail
cd "$(dirname "$0")/.."
uv run python scripts/generate_audio.py "$@"
