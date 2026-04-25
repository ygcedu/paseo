#!/bin/bash
set -e
# Paseo Desktop Release Builder
# Usage: ./scripts/build-release.sh <platform> <arch>
# Examples: build-release.sh mac arm64 | win x64 | linux x64

cd "$(dirname "$0")/.."

PLATFORM=${1:-""}
ARCH=${2:-""}

if [ -z "$PLATFORM" ] || [ "$PLATFORM" = "-h" ] || [ "$PLATFORM" = "--help" ]; then
  echo "Usage: $0 <mac|win|linux> <arm64|x64|ia32>"
  exit 0
fi

if [ -z "$ARCH" ]; then
  echo "Error: architecture not specified" >&2; exit 1
fi

echo "Building Paseo Desktop for $PLATFORM $ARCH..."

npm --prefix ../.. run build:daemon
npm --prefix ../app run build:web
npm run build:main

# Disable hardenedRuntime and notarize for local builds (requires Apple Developer credentials)
# Set CSC_NAME to a real identity to re-enable proper signing
export CSC_NAME="${CSC_NAME:--}"
export NOTARIZE="${NOTARIZE:-false}"

case "$PLATFORM" in
  mac)  npx electron-builder --config=electron-builder.yml --mac --"$ARCH" \
          --config.mac.hardenedRuntime=false --config.mac.notarize=false ;;
  win)  npx electron-builder --config=electron-builder.yml --win  --"$ARCH" ;;
  linux) npx electron-builder --config=electron-builder.yml --linux --"$ARCH" ;;
  *)    echo "Error: unknown platform $PLATFORM" >&2; exit 1 ;;
esac

# Re-sign macOS app after electron-builder's after-pack prunes native modules
# (pruning invalidates the signature, so we must re-sign afterwards)
if [ "$PLATFORM" = "mac" ]; then
  APP_PATH=$(ls -d release/mac*/Paseo.app 2>/dev/null | head -1)
  if [ -n "$APP_PATH" ]; then
    codesign --force --deep --sign - "$APP_PATH"
    echo "Re-signed macOS app (ad-hoc)"
  fi
fi

echo "Done. Output in: $(pwd)/release/"
