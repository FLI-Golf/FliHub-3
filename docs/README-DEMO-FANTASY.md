# Demo fantasy participant setup

Use this tool only in a disposable development league. It fills remaining participant places without manually registering accounts, sending invitations, or accepting and approving each participant.

## Enable

Stop the existing PocketBase process in its terminal. From the repository root, run:

```bash
FLIHUB_DEMO_FANTASY=1 npm run pocketbase
```

The PocketBase process must inherit both FLIHUB_DEMO_FANTASY=1 and the Codespace's CODESPACE_NAME. Setting the flag in the Vite terminal does not enable a PocketBase process already running elsewhere. No database migration is needed.

## Use

1. Sign in as the fantasy league commissioner, for example Jim.
2. Open the fantasy league before creating a draft.
3. Find Demo testing · Add fantasy participants.
4. Choose a demo password of 12–72 characters.
5. Click Fill remaining places with demo participants.
6. Copy the displayed email addresses if you want to test another participant's account.

With Jim and a limit of six, this creates five accounts. Each account is clearly named with (Demo), verified, and approved in this fantasy league. Emails use league-specific example.com addresses. The password is never returned by the endpoint or included in action results. Keep the password you entered if you need to sign in later.

Existing participants stay unchanged. These accounts gain no organization staff memberships. No invitation records or emails are created. Creating demo data and membership rows is transactional.

## Restrictions

The UI appears only in development for the commissioner of a league with remaining places and no drafts. The endpoint independently checks the demo flag, Codespace environment, commissioner identity, capacity, pending invitations, and draft existence. Pending invitations must be resolved first. Existing accounts are never taken over and passwords are never reset. A full league rerun creates nothing. Demo setup is blocked after any draft has been created.

To disable the endpoint, restart PocketBase without FLIHUB_DEMO_FANTASY. Demo accounts remain until explicitly removed; disabling the flag does not delete accounts or fantasy history.

## Verification

Run node --test tests/demo-fantasy.test.mjs, npm run check, and npm run build. Tests simulate the PocketBase app; verify account creation and login against the actual Codespace database before merging.

## Reset a completed demo draft

The completed draft page offers Reset demo draft to the commissioner in development. Choose a 7, 15, or 30 second timer (default 30), confirm that picks can be cleared, and reset. The draft returns to Ready; use Start draft when ready to run again.

The reset permanently clears only that draft's fantasy picks, including its fantasy substitution annotations. Participants, accounts, saved draft order, athlete ranking, event setup, real scores, and official results are preserved. It clears the draft timestamps, deadline, current pick, and resolution flag in the same transaction as deleting picks.

The endpoint requires FLIHUB_DEMO_FANTASY=1, a Codespace environment, commissioner identity, a completed draft, explicit confirmation, and league-specific demo email addresses for every other current participant. Active drafts and leagues with real participants cannot use this reset. The normal draft start cutoff checks still apply.

The accompanying display change uses an athlete grid, excludes drafted athletes, and filters remaining gender places in rounds three and four for the participant currently on the clock. Manual Pick controls remain available only during the signed-in participant's turn.

Verify with node --test tests/demo-draft-reset.test.mjs and npm run check, then run the actual reset/restart flow in Codespaces. Tests simulate the PocketBase transaction; they do not replace a live database check.
