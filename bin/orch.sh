#!/usr/bin/env bash
# Shipyard Platform bridge for the role pipeline — see bin/orch.py for commands and exit codes.
exec python3 "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/orch.py" "$@"
