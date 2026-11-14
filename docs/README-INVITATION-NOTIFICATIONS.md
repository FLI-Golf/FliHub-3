# Organization invitation notifications

Status: source prepared for local validation; lint/type/build, isolated integration tests, and browser verification remain required. No schema or collection-rule changes are included.

## Experience

The signed-in app shell includes an Invitations link on desktop and mobile. Verified users receive an amber notice when pending organization invitations exist, including on account and scoring pages. Review invitations opens /invitations, showing organization, assigned role, and expiry, with an explicit Accept invitation button. Review itself grants no membership.

The notice checks immediately after mounting, every 30 seconds while the tab is visible, and on returning to the tab. It uses a private same-origin notice endpoint, not a full page invalidation, so polling does not reload a scorecard or reset its inputs. Hidden-tab checks are skipped; outstanding requests are cancelled on teardown. The component is keyed to the signed-in user to avoid retaining another account's notice. Check again and Refresh invitations support manual refresh. There is no email delivery, browser push permission, or service worker.

Accepted, revoked, or expired invitations no longer produce a pending notice on the next check. On lookup failure the UI reports that invitations could not be checked; it does not claim there are none. Unverified accounts must verify before viewing invitation metadata or accepting. Sign-in redirects use the existing app layout. Accepting sets the active organization and redirects to its overview; existing memberships are not changed.

## Backend and privacy

GET /api/flihub/invitations/pending reads only the authenticated verified user's normalized email, pending status, and unexpired records. A client-supplied email is ignored. The endpoint returns a paginated allowlist of invitationId, organizationName, role, and expiresAt. No token, token hash, recipient email, private organization data, or membership list is returned. Page sizes are capped at 20; the banner requests one row only. Responses are private and no-store.

POST /api/flihub/invitations/accept continues supporting the existing token flow. It additionally accepts invitationId as an alternative, never alongside a token. An ID is not a bearer credential: the same transaction finds that invitation by ID AND the signed-in verified email, then rechecks status, expiry, recipient, and existing membership. The existing membership creation, invitation update, unique-index concurrency protection, and acceptance audit are reused. Wrong-recipient ID lookups return a generic 404, not invitation status.

No generic invitation collection access rule is relaxed. Existing copy-link invitations continue working. The API list contains information specifically disclosed to the invited recipient before membership; it does not expose that organization to other users or make it public.

## Validation

Run node --test tests/invitation-notifications.test.mjs, targeted Prettier/ESLint, npm run check, the local-backend production build, and npm run test:integration. New unit tests use simulated records; the integration suite exercises the real disposable PocketBase stack and preserves the old token acceptance tests.

Restart LOCAL PocketBase to load the new hook. Do not test against production.

1. As Bob, create or reuse the pending Scorekeeper invitation to morgan@example.com for Guided Disc Golf Test. Do not create duplicates if one is already pending.
2. Sign in as Morgan. Stay on scoring assignments or the existing scorecard. The notice should appear on initial load, focus, or within 30 seconds; existing scoring content must remain intact.
3. Choose Review invitations. Check Guided Disc Golf Test, role Scorekeeper, and expiry. Before acceptance Morgan must still lack membership in that organization.
4. Click Accept invitation once. Confirm redirect to Guided Disc Golf Test, role Scorekeeper, no setup checklist, and no Settings management link. Confirm Morgan still belongs to Bobs Org.
5. The notice should disappear when no pending invitations remain. Reopening the inbox should show no accepted invitation.
6. Test a revoked or expired invitation with the disposable suite. Wrong email, unverified email, forged ID, replay, and concurrent acceptance must not create unauthorized or duplicate membership.
7. Check the inbox and notice at a narrow viewport and with keyboard navigation. No raw token or hash should appear in notification links or listed payloads.

The organization checklist remains Ready to verify until the remaining role, disabled-capability, and mobile checks are complete; this increment does not mark it complete.
