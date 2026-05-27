#!/bin/bash
set -euo pipefail
SERVICE=connect-four.service
if systemctl list-unit-files "$SERVICE" >/dev/null 2>&1; then
  sudo systemctl restart "$SERVICE"
  sudo systemctl --no-pager --full status "$SERVICE"
else
  echo "Service $SERVICE not found. Start manually: ./start.sh"
  exit 1
fi
