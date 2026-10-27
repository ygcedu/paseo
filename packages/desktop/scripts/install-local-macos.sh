#!/usr/bin/env bash
set -euo pipefail

prepare() {
  [[ "$(uname -s)" == Darwin ]] || { echo "This installer requires macOS." >&2; exit 1; }
  script="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  release="$(dirname "$script")/../release"
  architecture=$(uname -m)
  [[ "$architecture" != x86_64 ]] || architecture=x64
  image=
  for candidate in "$release"/Paseo-*-"$architecture".dmg; do
    [[ -f "$candidate" ]] || continue
    if [[ -z "$image" || "$candidate" -nt "$image" ]]; then image=$candidate; fi
  done
  [[ -n "$image" ]] || { echo "No $architecture DMG in $release. Run build-macos first." >&2; exit 1; }

  lock=/Applications/.paseo-local-install-lock
  mkdir "$lock" || { echo "Cannot acquire $lock. Check permissions or a pending install in ~/Library/Logs/Paseo/local-installs." >&2; exit 1; }
  mount=
  staging=
  mounted=false
  submitted=false
  handed_off=false
  domain="gui/$(id -u)"
  label="sh.paseo.local-install.$(date +%s)-$$"
  job="$HOME/Library/Logs/Paseo/local-installs/$label"
  target=/Applications/Paseo.app
  backup="/Applications/Paseo.app.previous-$(date +%Y%m%d-%H%M%S)-$$"
  trap cleanup_prepare EXIT
  trap 'exit 1' HUP INT TERM

  mount=$(mktemp -d "${TMPDIR:-/tmp}/paseo-dmg.XXXXXX")
  echo "Preparing $image"
  /usr/bin/hdiutil attach "$image" -readonly -nobrowse -mountpoint "$mount"
  mounted=true
  [[ -f "$mount/Paseo.app/Contents/MacOS/Paseo" ]] || { echo "The DMG does not contain Paseo.app." >&2; exit 1; }
  staging=$(mktemp -d /Applications/.paseo-install.XXXXXX)
  staged_app="$staging/Paseo.app"
  /usr/bin/ditto "$mount/Paseo.app" "$staged_app"
  /usr/bin/codesign --verify --deep --strict "$staged_app"
  /usr/bin/hdiutil detach "$mount"
  mounted=false

  mkdir -p "$job"
  chmod 700 "$job"
  cp "$script" "$job/install.sh"
  plist="$job/job.plist"
  /usr/bin/plutil -create xml1 "$plist"
  /usr/bin/plutil -insert Label -string "$label" "$plist"
  /usr/bin/plutil -insert ProgramArguments -array "$plist"
  index=0
  for argument in /bin/bash "$job/install.sh" --install "$staged_app" "$target" "$backup" "$job" "$lock" "$domain/$label"; do
    /usr/bin/plutil -insert "ProgramArguments.$index" -string "$argument" "$plist"
    index=$((index + 1))
  done
  /usr/bin/plutil -insert RunAtLoad -bool true "$plist"
  /usr/bin/plutil -insert EnvironmentVariables -dictionary "$plist"
  /usr/bin/plutil -insert EnvironmentVariables.PATH -string /usr/bin:/bin:/usr/sbin:/sbin "$plist"
  /usr/bin/plutil -insert StandardOutPath -string "$job/install.log" "$plist"
  /usr/bin/plutil -insert StandardErrorPath -string "$job/install.log" "$plist"
  echo "Paseo will quit and reopen after installation. Log: $job/install.log"
  /bin/launchctl bootstrap "$domain" "$plist"
  submitted=true
  for ((attempt=0; attempt<100; attempt++)); do
    [[ -f "$job/ready" ]] && break
    sleep 0.1
  done
  [[ -f "$job/ready" ]] || { echo "Installer did not start. See $job/install.log" >&2; exit 1; }
  # The independent process must acknowledge startup before it may quit Paseo.
  touch "$job/go"
  handed_off=true
  echo "Installer handed off to macOS. Temporary files and job registration will be removed when finished."
}

cleanup_prepare() {
  result=$?
  trap - EXIT
  set +e
  if [[ "$handed_off" == false ]]; then
    if [[ "$submitted" == true ]]; then /bin/launchctl bootout "$domain/$label" || true; fi
    if [[ -f "$job/install.log" ]]; then cp "$job/install.log" "$(dirname "$job")/last-install-error.log"; fi
    [[ ! -d "$job" ]] || rm -rf -- "$job"
    rmdir "$(dirname "$job")" 2>/dev/null || true
    [[ -z "$staging" ]] || rm -rf "$staging"
    rmdir "$lock"
  fi
  if [[ "$mounted" == true ]]; then /usr/bin/hdiutil detach "$mount"; fi
  [[ -z "$mount" ]] || rmdir "$mount"
  exit "$result"
}

if [[ "${1:-}" != --install ]]; then
  prepare
  exit 0
fi
shift

staged_app=$1
target=$2
backup=$3
job=$4
lock=$5
service=${6:-}
replacing=false

status() {
  printf '%s\n' "$1" > "$job/status"
  printf '%s: %s\n' "$(date -u +%FT%TZ)" "$1"
}

cleanup() {
  result=$?
  trap - EXIT
  # Cleanup must continue even if one filesystem operation fails.
  set +e
  preserve_staging=false
  if [[ "$result" -ne 0 ]]; then
    if [[ "$replacing" == true && ! -e "$target" && -d "$backup" ]]; then
      if ! mv "$backup" "$target"; then
        status "FAILED: restore $backup to $target manually; staging preserved at $staged_app"
        preserve_staging=true
      fi
    fi
    if [[ "$preserve_staging" == false ]]; then status "FAILED: previous installation preserved"; fi
    error_log="$(dirname "$job")/last-install-error.log"
    { [[ ! -f "$job/install.log" ]] || cat "$job/install.log"; cat "$job/status"; } > "$error_log"
  else
    rm -f -- "$(dirname "$job")/last-install-error.log"
  fi
  if [[ "$preserve_staging" == false ]]; then rm -rf "$(dirname "$staged_app")"; fi
  rm -rf -- "$job"
  rmdir "$(dirname "$job")" 2>/dev/null || true
  rmdir "$lock"
  # bootout terminates this job too, so it must be the final cleanup operation.
  if [[ -n "$service" ]]; then exec /bin/launchctl bootout "$service"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

status "Waiting for handoff"
touch "$job/ready"
for ((attempt=0; attempt<30; attempt++)); do
  [[ -f "$job/go" ]] && break
  sleep 1
done
[[ -f "$job/go" ]] || { status "Handoff timed out"; exit 1; }

running_pids() {
  ps -axo pid=,comm= | awk -v executable="$target/Contents/MacOS/Paseo" '
    { pid=$1; sub(/^[[:space:]]*[0-9]+[[:space:]]+/, ""); if ($0 == executable) print pid }'
}

pids=$(running_pids)
if [[ -n "$pids" ]]; then
  status "Waiting for Paseo to quit"
  # Paseo handles SIGTERM through its normal quit lifecycle, without Apple Events permissions.
  while read -r pid; do kill -TERM "$pid"; done <<< "$pids"
  for ((attempt=0; attempt<120; attempt++)); do
    pids=$(running_pids)
    [[ -z "$pids" ]] && break
    sleep 1
  done
  if [[ -n "$pids" ]]; then
    status "Paseo did not quit within 120 seconds; installation cancelled"
    exit 1
  fi
fi

status "Installing"
if [[ -e "$target" ]]; then
  [[ ! -e "$backup" ]]
  replacing=true
  mv "$target" "$backup"
fi
mv "$staged_app" "$target"
status "Installed; backup: $backup"
open "$target"
for previous in "$target".previous-[0-9]*; do
  [[ "$previous" != "$backup" && -d "$previous" && ! -L "$previous" ]] || continue
  if ! rm -rf -- "$previous"; then
    echo "Warning: could not remove older backup $previous" >&2
  fi
done
status "SUCCESS"
