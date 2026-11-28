# FliHub funding roadmap

**Last updated:** November 23, 2026
**Current development phase:** Phase 2 — Donations, pledges, and other funding
**Development branch:** `feature/funding-phase-2`

## Purpose

Give each organization a way to see who is funding its activities, what the funding covers, how much was committed, and how much has actually been received.

FLI Golf begins with paid sponsorships. Phase 2 extends the funding system to donations, pledges, and charitable fundraising so that other organizations can use the same financial tracking foundation.

The system must always distinguish:

- **Committed funding:** Money promised through signed sponsorship agreements or pledges.
- **Received funding:** Money actually received and recorded.
- **Outstanding funding:** Committed amounts that have not yet been received.
- **Funding currency:** Financial totals tracked separately by currency without automatic conversion.

A commitment must never be counted as a received payment until an actual receipt is recorded.

---

## Where the app stands today

### Sponsorship management — Implemented

Sponsorships is an organization-level sales tracker for owners and admins.

Each sponsor record stores:

- Sponsor contact details
- Sales stage
- Follow-up date
- Next action
- Notes
- Archive and restore status

The supported sales stages are Prospect, In discussion, Proposal sent, Signed, and Closed.

### Funding Phase 1 — Implemented and merged into main

Phase 1 introduced the following functionality:

**Sponsorship agreements**

- Multiple agreements per sponsor
- Independent financial terms and benefits
- Organization, league, season, team, event, and event-hole coverage
- Specific tournament-hole selection during quote conversion
- Direct agreement entry

**Sponsorship packages and quotes**

- Configurable sponsorship packages across six tiers
- Required and removable benefits
- Draft quotes with recalculated pricing
- Reduced-price quotes when optional benefits are removed
- Conversion of accepted quotes into agreements
- Preservation of negotiated terms independent of later package changes

**Installments and funding conditions**

- Installment schedules and due dates
- Saved funding conditions
- Signed commitment thresholds
- Conditional installment release
- Separate tracking of scheduled and received payments

**Payments and reconciliation**

- Manual payment recording
- Partial payments
- Audited payment reversals
- Outstanding agreement balances
- Organization funding totals grouped by currency
- Filtering by sponsor, season, event, and payment status

### Recent development history

| Work                                      | Status                                       |
| ----------------------------------------- | -------------------------------------------- |
| Funding Phase 1                           | Merged into main                             |
| PR #50 — Demo sponsorship tiers 3–6       | Merged, commit `a148564`                     |
| PR #51 — Restore CI lint checks           | Merged; five checks passed                   |
| Reduced-price draft verification          | Verified for tiers 3–6                       |
| Required-benefit protection               | Verified for tested tier drafts              |
| Specific tournament-hole selection        | Verified in conversion form                  |
| PR #50 final CI and production deployment | Not verified in previous development session |

**Important:** Sponsorship package prices and benefits are illustrative demonstration data. They are not approved commercial prices.

The existing sponsorship workflows must remain functional throughout Phase 2 development.

---

## Phase 1 — Paid sponsorships for FLI Golf

**Status:** Implemented and merged. Preserve existing behavior and continue regression testing.

### 1A — Agreements and coverage

Build on the existing sponsor record.

A sponsor can have multiple agreements with independent terms. A title agreement for the full tour year can use one season-level record covering all 12 tournaments.

Keep the contract start and end dates and the actual benefits agreed to.

For hole placements, resolve the hole against the event layout and distinguish repeated holes by round.

### 1B — Sponsorship tiers and quotes

1. **Configure packages.** Allow authorized staff to set up Title Sponsor and other packages across six tiers. Each package has a name, currency, and checklist of benefits. Price each benefit and configure which items are required and which can be removed.
2. **Build a quote from a package.** Start with selected package benefits. Recalculate the total when a salesperson removes or restores a removable benefit. Save the sponsor, proposed coverage, selected benefits, prices, and quote total together.
3. **Convert an accepted quote to an agreement.** Copy the final benefits and negotiated terms into the agreement. Store the agreed amount and currency in minor units and preserve the accepted terms if package defaults change later. Keep direct agreement entry available.

**Demo example:** A Title Sponsor package starts at $625,000 with $500,000 for required tour naming rights, $75,000 for on-site activation, and $50,000 for digital promotion. Removing on-site activation reduces the quote to $550,000.

These figures and the discussed $500,000–$1 million range are illustrative. Package names, prices, and benefits require business approval before production use.

### 1C — Installments, funding conditions, and receipts

1. **Track installment schedules.** Record scheduled amounts and due dates. Reconcile schedules to agreed totals while retaining actual receipts separately, including amount, date, method, reference, recorder, and correction history.
2. **Support conditional commitments.** The title contract sample uses a 50% threshold of qualifying sponsor commitments against the tour sponsorship target. Capture the target, condition, and cutoff date. Track whether the condition is pending, met, or expired. Keep release rules configurable by agreement.
3. **Show funding progress.** Display signed commitments, amounts due, receipts, and outstanding balances separately. Provide an authorized organization view filterable by sponsor, season, event, and payment status. Report totals by currency.

**Pilot example:** A sponsor signs a $1,000 agreement for Hole 7 and a separate $2,500 team agreement. A $400 receipt against the hole agreement leaves $600 outstanding on that agreement and $2,500 outstanding on the team agreement.

### Phase 1 regression acceptance checks

These checks remain required during Phase 2 development.

- [ ] One sponsor can have multiple agreements, including season-level and event-hole coverage.
- [ ] Existing sponsor and agreement records remain usable.
- [ ] Quote totals recalculate correctly when removable benefits change.
- [ ] Required benefits cannot be removed.
- [ ] Accepted agreements retain their negotiated terms after package edits.
- [ ] Signed commitments can qualify toward funding thresholds without being counted as receipts.
- [ ] Conditional release and missed-deadline behavior remain correct.
- [ ] Partial payments update the correct agreement and organization totals.
- [ ] Payment reversals remain auditable and receipts are counted only once.
- [ ] Financial terms remain restricted to authorized users.
- [ ] Currency totals remain separated.
- [ ] Existing funding filters continue to work.

These are ongoing regression requirements, not a claim that every check has been rerun against the latest main branch.

---

## Phase 2 — Donations, pledges, and other funding

**Status:** Planned — development beginning.

**Goal:** Extend the funding workflow to organizations that raise money beyond paid sponsorships.

The initial pilot is a running event that raises money for a designated charity.

### Funding types

| Funding type | Description                                                                          |
| ------------ | ------------------------------------------------------------------------------------ |
| Sponsorship  | Paid agreement associated with a sponsor and defined benefits or placements          |
| Donation     | Contribution already received for an organization, event, or beneficiary             |
| Pledge       | Promise to contribute a specified amount, with optional due date and payment history |

All funding types must preserve their distinct financial meanings.

### Phase 2A — Direct donations and pledges

**Status:** Next implementation milestone.

**Goal:** Deliver the smallest functional donation and pledge workflow, including partial payments.

#### Requirements

1. **Record direct donations.**
   - Contributor name and available contact details
   - Donation amount and currency
   - Date received
   - Organization and optional event or purpose
   - Optional charitable beneficiary
   - Payment method and reference where applicable

2. **Record pledges.**
   - Contributor details
   - Total promised amount
   - Currency
   - Date pledged
   - Optional due date
   - Organization and optional event or purpose
   - Optional beneficiary
   - Pledge status derived from recorded payments where appropriate

3. **Apply payments to pledges.**
   - Each payment belongs to a specific pledge.
   - Record amount, currency, date, method, and reference.
   - Support partial payments.
   - Calculate remaining balances from valid received payments.
   - Prevent payments from exceeding the remaining pledge balance.
   - Do not silently overwrite or delete recorded payment history.

4. **Preserve financial separation.**
   - Pledged amounts are commitments, not receipts.
   - Direct donations count as received funding.
   - Pledge payments count as received funding.
   - Outstanding pledge balances represent unpaid commitments.
   - Financial totals remain separated by currency.
   - Existing sponsorship totals must not be duplicated or corrupted.

5. **Use existing application patterns.**
   - SvelteKit
   - TypeScript
   - Tailwind
   - shadcn-svelte
   - PocketBase collections, migrations, hooks, and access controls
   - Existing organization membership and authorization rules

#### Phase 2A pilot example

A charity running event records:

| Transaction                     |  Amount |
| ------------------------------- | ------: |
| Direct donation received        |    $500 |
| Pledge commitment               | $10,000 |
| Partial pledge payment received |  $3,000 |
| Remaining pledge balance        |  $7,000 |
| Total cash received             |  $3,500 |

The direct donation and pledge reference the same charitable beneficiary.

All amounts in this example are USD.

The $10,000 pledge must not be added to the $3,500 cash received.

#### Phase 2A acceptance checks

- [ ] Create and save a direct donation.
- [ ] Create and save a pledge without recording payment.
- [ ] Confirm that an unpaid pledge does not increase received funding.
- [ ] Record a partial payment against the pledge.
- [ ] Verify the remaining pledge balance.
- [ ] Confirm the direct donation and pledge share the intended beneficiary.
- [ ] Verify records and balances persist after refresh.
- [ ] Reject payments that exceed the outstanding pledge balance.
- [ ] Prevent duplicate counting of received payments.
- [ ] Preserve organization access controls.
- [ ] Confirm existing sponsorship workflows still function.
- [ ] Confirm existing sponsorship currency totals remain correct.

**Completion requirement:** Pass the acceptance checks, commit the implementation, and push the branch before opening the draft Phase 2 PR.

### Phase 2B — Unified funding reports

**Status:** Planned after Phase 2A.

**Goal:** Provide organization and event-level reporting across sponsorships, donations, and pledges.

#### Requirements

1. Filter by organization, event, beneficiary, and funding type.
2. Show sponsorship commitments separately from pledge commitments.
3. Show direct donations and pledge payments as received funding.
4. Show outstanding sponsorship and pledge balances.
5. Count each valid receipt exactly once.
6. Keep currency totals separate.
7. Preserve existing sponsorship filters and reporting behavior.
8. Make beneficiary assignments visible for review.

#### Phase 2B acceptance checks

- [ ] Event reports show direct donations and pledge payments.
- [ ] Outstanding pledges are reported separately from received funding.
- [ ] Sponsorship reporting continues to reconcile.
- [ ] Funding-type filters produce accurate totals.
- [ ] Event and beneficiary filters produce accurate totals.
- [ ] No receipt is counted twice.
- [ ] Different currencies are never silently combined.

### Phase 2C — Reconciliation, audit, and permissions

**Status:** Planned after Phase 2B.

**Goal:** Improve financial reliability and administrative review.

#### Requirements

1. Support traceable corrections or reversals for donation and pledge receipts.
2. Prevent duplicate payment counting.
3. Make missing or ambiguous beneficiary information visible to administrators.
4. Preserve payment and correction history.
5. Verify organization-level data isolation.
6. Reuse or extend established financial access controls.
7. Test mixed sponsorship, donation, and pledge reporting.

#### Phase 2C acceptance checks

- [ ] Payment corrections retain an audit trail.
- [ ] Reversed receipts do not inflate received totals.
- [ ] Missing beneficiary information is clearly flagged.
- [ ] Unauthorized users cannot access restricted financial records.
- [ ] Mixed funding totals reconcile correctly.
- [ ] Existing sponsorship payment reversal workflows remain functional.

### Phase 2D — Future funding enhancements

**Status:** Evaluation only — not committed to implementation.

Consider these capabilities after the manual donation and pledge workflows have been verified:

- Online donation checkout
- Automatically generated donor receipts
- Financial exports
- Public sponsor or donor recognition
- Additional funding categories
- Charity-specific reporting enhancements

Each enhancement requires a defined business use case, scope, and acceptance criteria before development begins.

---

## Phase 2 overall acceptance checks

Phase 2 is complete when:

- [ ] A charity running event can record a direct donation and a partially paid pledge for the same beneficiary.
- [ ] Pledged amounts, actual receipts, and remaining balances are independently visible.
- [ ] Event reporting reflects each valid receipt once.
- [ ] Reports can be filtered by event, beneficiary, and funding type.
- [ ] Missing or ambiguous beneficiary information is visible before administrators rely on reports.
- [ ] Sponsorship and donation workflows coexist without changing historical sponsorship totals.
- [ ] Financial access controls remain enforced.
- [ ] All affected currency totals reconcile correctly.
- [ ] Relevant automated tests and manual verification steps pass.

---

## Development and pull request workflow

Phase 2 development uses:

- **Repository:** `FLI-Golf/FliHub-3`
- **Branch:** `feature/funding-phase-2`
- **Base branch:** `main`
- **Environment:** GitHub Codespaces
- **Working directory:** `/workspaces/FliHub-3`

### Development sequence

1. Confirm the working branch and latest main commit.
2. Update and commit this roadmap.
3. Inspect existing funding collections, hooks, routes, and tests.
4. Implement the first small Phase 2A slice.
5. Run applicable checks and manually verify the charity-event pilot.
6. Commit and push the verified implementation.
7. Open a draft pull request targeting main.
8. Continue with additional small commits and pushes to the same draft PR.
9. Mark the PR ready for review after the agreed scope passes verification.

### Development safeguards

- Preserve existing PocketBase data and the working tree.
- Do not reset or delete existing development records without explicit approval.
- Use migrations rather than destructive schema changes.
- Preserve existing sponsorship APIs and calculations.
- Store monetary amounts using the established minor-unit conventions.
- Reuse existing authentication and organization permission patterns.
- Keep financial corrections traceable.
- Avoid mixing illustrative demo pricing with approved business pricing.
- Record the exact base commit for any generated patch.

---

## Decisions to confirm as we build

### Sponsorship decisions carried forward

- Confirm the production names, prices, benefits, and required items for all six sponsorship tiers.
- Confirm whether Title Sponsor maps to a numbered tier.
- Confirm discount and manual line-price override policies.
- Decide whether agreements can bundle multiple independently tracked placements.
- Confirm which commitments qualify for the 50% funding threshold.
- Confirm how installment due dates behave when a threshold is reached after a scheduled date.
- Decide whether sales staff need a separate quoting role and what financial terms that role may access.

### Phase 2 decisions

- Decide whether contributors should be stored as reusable organization-level records or entered directly on each donation or pledge.
- Confirm whether charitable beneficiaries need their own managed records.
- Define whether beneficiary designation is optional for all organizations or required for specific charity events.
- Confirm whether overpayments are rejected or handled through a separate credit/refund workflow.
- Define how payment reversals and pledge cancellations should work.
- Confirm whether donations and pledge payments require the same payment methods and references as sponsorship payments.
- Decide whether online checkout, donor receipts, exports, or public recognition are needed after the manual workflow is proven.

These decisions should be resolved as the relevant development slice begins rather than expanding the initial Phase 2A implementation unnecessarily.

---

## Immediate next action

**Begin Phase 2A — Direct donations and pledges.**

First inspect the current funding implementation and PocketBase patterns. Then implement and verify the smallest workflow that supports:

1. A direct donation.
2. A pledge commitment.
3. A partial payment against the pledge.
4. An accurate remaining pledge balance.
5. Preservation of existing sponsorship functionality.

After the first verified implementation commit, open the draft Phase 2 pull request and continue development through incremental pushes.
