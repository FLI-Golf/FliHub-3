#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
code=(
  pocketbase/pb_hooks/flihub_test_event_groups.pb.js
  pocketbase/pb_hooks/test_event_group_rules.js
  src/lib/components/EventOpsManager.svelte
  src/lib/components/GuidedEventSetup.svelte
  src/lib/event-setup/shuffle.ts
  'src/routes/(app)/organizations/[id]/cap/[capability]/+page.server.ts'
  tests/random-event-groups.test.mjs
)
npx --no-install prettier --write "${code[@]}" docs/README-RANDOM-TEST-GROUPS.md
npx --no-install eslint "${code[@]}"
node --test tests/random-event-groups.test.mjs
npm run check
FLIHUB_DEMO_FANTASY=0 npm run test:integration
POCKETBASE_URL=http://127.0.0.1:8090 npm run build
git diff --check
git --no-pager status --short --branch
