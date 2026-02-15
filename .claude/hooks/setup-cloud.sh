#!/bin/bash

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
    exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

pnpm install --frozen-lockfile 2>/dev/null

exit 0
