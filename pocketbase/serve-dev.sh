#!/bin/sh
# Start the local PocketBase development instance with the correct app URL for
# auth emails (verification links, password resets, etc.).
#
# PocketBase builds auth-email links as `{APP_URL}/...` from
# `settings.meta.appURL`, which the committed settings migration seeds to
# http://localhost:5173. That default is wrong inside a GitHub Codespace, where
# the app is reached through a forwarded HTTPS URL. The pb_hooks/appurl.pb.js
# onMailerSend hook rewrites the seeded app-URL base in each outgoing email to
# the value of FLIHUB_APP_URL, so this script resolves and exports it.
#
# The environment-specific URL is provided at process start and is never written
# to a committed migration or to pb_data. See pocketbase/README.md.
set -eu

# Resolve FLIHUB_APP_URL, in priority order:
#   1. explicit FLIHUB_APP_URL override (any environment or deployment)
#   2. the GitHub Codespace forwarded URL for the dev app port (5173)
#   3. the localhost fallback for plain local development
if [ -n "${FLIHUB_APP_URL:-}" ]; then
	resolved="$FLIHUB_APP_URL"
elif [ -n "${CODESPACE_NAME:-}" ] && [ -n "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]; then
	resolved="https://${CODESPACE_NAME}-5173.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
else
	resolved="http://localhost:5173"
fi
export FLIHUB_APP_URL="$resolved"

# Run from this script's directory so pb_hooks/, pb_migrations/, and pb_data/
# resolve relative to pocketbase/ no matter where the command is invoked from.
cd "$(dirname "$0")"

echo "PocketBase dev instance: http://127.0.0.1:8090"
echo "Auth-email app URL (FLIHUB_APP_URL): $FLIHUB_APP_URL"
exec ./pocketbase serve --http 127.0.0.1:8090
