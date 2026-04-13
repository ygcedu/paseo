#!/bin/bash
set -e

# Paseo Desktop Release Builder
# Usage: ./scripts/build-release.sh [platform] [arch]
# Examples:
#   ./scripts/build-release.sh win x64        # Windows x64
#   ./scripts/build-release.sh win ia32       # Windows x86 (32-bit)
#   ./scripts/build-release.sh mac arm64      # macOS ARM64
#   ./scripts/build-release.sh mac x64        # macOS x64
#   ./scripts/build-release.sh linux x64      # Linux x64
#   ./scripts/build-release.sh all            # Build all platforms

PLATFORM=${1:-""}
ARCH=${2:-""}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_usage() {
    cat << EOF
Paseo Desktop Release Builder

Usage: $0 [platform] [arch]

Platforms:
  win       Windows
  mac       macOS
  linux     Linux
  all       Build all platforms

Architectures:
  x64       64-bit (default for most platforms)
  ia32      32-bit (Windows only)
  arm64     ARM 64-bit (macOS, Linux)
  armv7l    ARM 32-bit (Linux only)

Examples:
  $0 win x64              # Windows 64-bit
  $0 win ia32             # Windows 32-bit
  $0 mac arm64            # macOS ARM64 (Apple Silicon)
  $0 mac x64              # macOS Intel
  $0 linux x64            # Linux 64-bit
  $0 all                  # Build all common platforms

Output:
  Release files will be in: packages/desktop/release/

EOF
}

build_platform() {
    local platform=$1
    local arch=$2

    log_info "Building for ${platform} ${arch}..."

    # Build daemon and main process first
    log_info "Building daemon..."
    npm --prefix ../.. run build:daemon

    log_info "Building desktop main process..."
    npm run build:main

    # Build with electron-builder
    local builder_args="--config electron-builder.yml"

    case $platform in
        win)
            builder_args="$builder_args --win"
            if [ "$arch" = "ia32" ]; then
                builder_args="$builder_args --ia32"
            elif [ "$arch" = "x64" ]; then
                builder_args="$builder_args --x64"
            else
                builder_args="$builder_args --x64"
            fi
            ;;
        mac)
            builder_args="$builder_args --mac"
            if [ "$arch" = "arm64" ]; then
                builder_args="$builder_args --arm64"
            elif [ "$arch" = "x64" ]; then
                builder_args="$builder_args --x64"
            else
                builder_args="$builder_args --arm64"
            fi
            ;;
        linux)
            builder_args="$builder_args --linux"
            if [ "$arch" = "arm64" ]; then
                builder_args="$builder_args --arm64"
            elif [ "$arch" = "armv7l" ]; then
                builder_args="$builder_args --armv7l"
            elif [ "$arch" = "x64" ]; then
                builder_args="$builder_args --x64"
            else
                builder_args="$builder_args --x64"
            fi
            ;;
        *)
            log_error "Unknown platform: $platform"
            return 1
            ;;
    esac

    log_info "Running: npx electron-builder $builder_args"
    npx electron-builder $builder_args

    log_info "Build completed for ${platform} ${arch}"
}

build_all() {
    log_info "Building all common platforms..."

    # Windows
    build_platform win x64
    build_platform win ia32

    # macOS
    build_platform mac arm64
    build_platform mac x64

    # Linux
    build_platform linux x64

    log_info "All builds completed!"
}

list_outputs() {
    log_info "Release files:"
    if [ -d "release" ]; then
        ls -lh release/*.{exe,dmg,zip,AppImage,deb,rpm,tar.gz} 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
    else
        log_warn "No release directory found"
    fi
}

# Main script
cd "$(dirname "$0")/.."

if [ "$PLATFORM" = "" ] || [ "$PLATFORM" = "-h" ] || [ "$PLATFORM" = "--help" ]; then
    show_usage
    exit 0
fi

log_info "Paseo Desktop Release Builder"
log_info "=============================="

if [ "$PLATFORM" = "all" ]; then
    build_all
else
    if [ "$ARCH" = "" ]; then
        log_error "Architecture not specified"
        show_usage
        exit 1
    fi
    build_platform "$PLATFORM" "$ARCH"
fi

echo ""
list_outputs
echo ""
log_info "Done! Release files are in: $(pwd)/release/"
