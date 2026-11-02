#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || "$1" != /* || ! -d "$1" ]]; then
  echo 'Usage: export-preview.sh EXISTING_ABSOLUTE_OUTPUT_DIRECTORY [PORT]' >&2
  exit 1
fi

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
output_dir="$(cd -- "$1" && pwd -P)"
port="${2:-8788}"
case "$output_dir/" in
  "$repo_dir/"*) echo 'The output directory must be outside the checkout.' >&2; exit 1 ;;
esac
if git -C "$output_dir" rev-parse --show-toplevel >/dev/null 2>&1; then
  echo 'The output directory must be outside any Git checkout.' >&2
  exit 1
fi
if [[ ! "$port" =~ ^[0-9]+$ ]] || (( ${#port} > 5 )) || (( 10#$port < 1024 || 10#$port > 65535 )); then
  echo 'PORT must be a number from 1024 to 65535.' >&2
  exit 1
fi
port="$((10#$port))"

cd -- "$repo_dir"
node --input-type=module -e '
  import net from "node:net";
  const server = net.createServer();
  server.on("error", () => { console.error("The preview port is unavailable."); process.exitCode = 1; });
  server.listen(Number(process.argv[1]), () => server.close());
' "$port"

log_dir="$(mktemp -d /tmp/rig-preview.XXXXXX)"
log_dir="$(cd -- "$log_dir" && pwd -P)"
partial="$output_dir/.index.html.tmp.$$"
server_pid=''
cleanup() {
  if [[ -n "$server_pid" ]]; then
    kill "$server_pid" 2>/dev/null || true
    for ((i = 0; i < 50; i++)); do
      kill -0 "$server_pid" 2>/dev/null || break
      sleep 0.1
    done
    kill -KILL "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -f -- "$partial"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

# Load the local .env like pnpm start, but own Node directly so no wrapper child survives.
PORT="$port" node --import tsx --env-file-if-exists=.env src/server.ts >"$log_dir/server.log" 2>&1 &
server_pid=$!
base_url="http://127.0.0.1:$port"
ready=false
for ((i = 0; i < 100; i++)); do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    break
  fi
  if grep -Fq "http://localhost:$port" "$log_dir/server.log" &&
    curl --fail --silent --max-time 1 "$base_url/health" >/dev/null; then
    ready=true
    break
  fi
  sleep 0.1
done
if [[ "$ready" != true ]]; then
  echo "rig did not become ready; inspect $log_dir/server.log locally." >&2
  exit 1
fi

curl --fail --silent --show-error --max-time 30 "$base_url/digest/2026-10-28" --output "$partial"
mv -f -- "$partial" "$output_dir/index.html"
echo "Saved $output_dir/index.html"
echo "Server log: $log_dir/server.log"
