#!/usr/bin/env bash
set -euo pipefail

cd /root/.openclaw/workspace/whatsapp-pending
DIGEST=$(npm run digest --silent)
openclaw message send --channel telegram --target 970949535 --message "$DIGEST"
