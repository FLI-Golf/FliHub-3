#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

files=(
  pocketbase/pb_hooks/tee_time_zones.json
  docs/DECISIONS.md
  docs/README-GUIDED-EVENT-SETUP.md
  docs/README-MULTI-EVENT-PLATFORM.md
  docs/ROADMAP.md
  pocketbase/pb_migrations/1794931200_event_venue_details.js
  pocketbase/pb_hooks/flihub_guided_event_setup.pb.js
  pocketbase/pb_hooks/guided_event_setup_rules.js
  src/lib/components/EventOpsManager.svelte
  src/lib/components/EventsManager.svelte
  src/lib/components/GuidedEventSetup.svelte
  src/lib/event-setup/schedule.ts
  src/lib/event-setup/types.ts
  'src/routes/(app)/organizations/[id]/cap/[capability]/+page.server.ts'
  'src/routes/(app)/organizations/[id]/cap/[capability]/+page.svelte'
  tests/guided-event-schedule.test.mjs
  tests/guided-event-setup.test.mjs
  tests/integration/guided-event-setup.test.mjs
)
code=(
  pocketbase/pb_migrations/1794931200_event_venue_details.js
  pocketbase/pb_hooks/flihub_guided_event_setup.pb.js
  pocketbase/pb_hooks/guided_event_setup_rules.js
  src/lib/components/EventOpsManager.svelte
  src/lib/components/EventsManager.svelte
  src/lib/components/GuidedEventSetup.svelte
  src/lib/event-setup/schedule.ts
  src/lib/event-setup/types.ts
  'src/routes/(app)/organizations/[id]/cap/[capability]/+page.server.ts'
  'src/routes/(app)/organizations/[id]/cap/[capability]/+page.svelte'
  tests/guided-event-schedule.test.mjs
  tests/guided-event-setup.test.mjs
  tests/integration/guided-event-setup.test.mjs
)

npx --no-install prettier --write "${files[@]}"
npx --no-install eslint "${code[@]}"
node --test tests/guided-event-setup.test.mjs tests/guided-event-schedule.test.mjs
npm run check
npm run test:integration
POCKETBASE_URL=http://127.0.0.1:8090 npm run build
git diff --check
git --no-pager status --short --branch
