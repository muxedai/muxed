#!/usr/bin/env bash
# Dump all PostHog MCP tool schemas via muxed into individual JSON files.
# Usage: bash evals/scripts/dump-posthog-schemas.sh

set -euo pipefail

OUT_DIR="evals/servers/posthog-schemas"
mkdir -p "$OUT_DIR"

# Get all posthog tool names
echo "Fetching tool list..."
TOOLS=$(npx muxed tools posthog 2>/dev/null | awk 'NR>1 {print $1}' | grep '^posthog/')

TOTAL=$(echo "$TOOLS" | wc -l | tr -d ' ')
echo "Found $TOTAL tools. Dumping schemas..."

COUNT=0
for tool in $TOOLS; do
  # Strip "posthog/" prefix for filename
  name="${tool#posthog/}"
  outfile="$OUT_DIR/$name.txt"

  npx muxed info "$tool" 2>/dev/null > "$outfile" || echo "FAILED: $tool"

  COUNT=$((COUNT + 1))
  if [ $((COUNT % 20)) -eq 0 ]; then
    echo "  $COUNT / $TOTAL done..."
  fi
done

echo "Done. $COUNT schemas dumped to $OUT_DIR/"
