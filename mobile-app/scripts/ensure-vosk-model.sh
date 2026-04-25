#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/assets/model-wake-en"
MARKER="$TARGET/am/final.mdl"
if [[ -f "$MARKER" ]]; then
  echo "[vosk] model already present: $TARGET"
  exit 0
fi
ZIP_URL="https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
INNER_NAME="vosk-model-small-en-us-0.15"
TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT
echo "[vosk] downloading English small model (~40MB)..."
curl -fsSL "$ZIP_URL" -o "$TMP/model.zip"
mkdir -p "$TARGET"
unzip -q "$TMP/model.zip" -d "$TMP/extract"
INNER="$TMP/extract/$INNER_NAME"
if [[ ! -d "$INNER" ]]; then
  echo "[vosk] error: expected folder $INNER_NAME not in zip" >&2
  ls -la "$TMP/extract" >&2
  exit 1
fi
shopt -s dotglob nullglob
for item in "$INNER"/*; do
  base="$(basename "$item")"
  rm -rf "$TARGET/$base"
  mv "$item" "$TARGET/"
done
if [[ ! -f "$MARKER" ]]; then
  echo "[vosk] error: model incomplete after extract (missing $MARKER)" >&2
  exit 1
fi
echo "[vosk] installed into $TARGET"
