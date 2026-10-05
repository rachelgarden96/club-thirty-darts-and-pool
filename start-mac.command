#!/bin/bash
# Double-click me on a Mac to start Club Thirty.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed yet. Opening the download page: install the LTS version, then double-click this file again."
  open "https://nodejs.org/"
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
node server.js
