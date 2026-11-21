# FliHub funding roadmap

## Purpose

Give each organization a way to see who is funding its activities, what the funding covers, how much was committed, and how much has actually been received. FLI Golf starts with paid sponsorships. Other organizations can use the same workflow for donations and pledges in Phase 2.

## Where the app stands today

**Sponsorships** is an organization-level sales tracker for owners and admins. It stores sponsor contact details, sales stage, follow-up date, next action, and notes. The stages are Prospect, In discussion, Proposal sent, Signed, and Closed. A sponsor record can be archived and restored.

Owners and admins can now add paid agreements from an existing sponsor, record the agreed amount and benefits, and link the agreement to the organization, a league, season, team, event, or a hole in a specific event round. The development seed and clear workflow was verified in Codespaces. Package quoting, installments, and funding thresholds are upcoming.

## Phase 1 — Paid sponsorships for FLI Golf

### 1A — Agreements and coverage

Build on the existing sponsor record. A sponsor can have multiple agreements with independent terms. A title agreement for the full tour year can use one season-level record covering all 12 tournaments. Keep the contract start and end dates and the actual benefits agreed to. For hole placements, resolve the hole against the event layout and distinguish repeated holes by round.

### 1B — Sponsorship tiers and quotes

1. **Configure packages.** Allow authorized staff to set up Title Sponsor and other packages across six tiers. Each package has a name, currency, and checklist of benefits. Price each benefit and let staff configure which items are required and which can be removed.
2. **Build a quote from a package.** Start with the package benefits selected. Recalculate the total immediately when a salesperson removes or restores a removable benefit. Keep the sponsor, proposed coverage, selected benefits, prices, and quote total together in a saved draft.
3. **Convert an accepted quote to an agreement.** Copy the final selected benefits and negotiated terms into the agreement. Store the agreed amount and currency in minor units and retain the exact terms if package defaults change later. Keep direct agreement entry for deals negotiated outside the quote workflow.

**Demo example.** A Title Sponsor package starts at $625,000 with $500,000 for required tour naming rights, $75,000 for on-site activation, and $50,000 for digital promotion. Removing on-site activation reduces the quote to $550,000. These figures and the discussed $500,000–$1 million range are illustrative. The example is a test fixture, and the remaining packages need real names, prices, and benefits.

### 1C — Installments, funding conditions, and receipts

1. **Track the installment schedule.** Record each scheduled amount and due date. Reconcile the schedule to the agreed total and retain the actual receipts separately, including amount, date, method, reference, recorder, and correction history.
2. **Support conditional commitments.** The title contract sample uses a 50% threshold of qualifying sponsor commitments against the tour's sponsorship target. Capture the target, condition, and cutoff date and track whether the condition is pending, met, or expired. Meeting it releases payment according to the agreement's schedule. Keep the example contract rule configurable by agreement and confirm the qualifying commitments and timing rules before automating it.
3. **Show funding progress.** Display signed commitments, amounts due, receipts, and outstanding balances as distinct figures. Give owners and admins an organization view filterable by sponsor, season, event, or payment status. Report totals by currency and keep financial terms, payment schedules, and receipts within authorized views.

**Pilot example.** A sponsor signs a $1,000 agreement for Hole 7 and a separate $2,500 team agreement. A $400 receipt against the hole agreement leaves $600 outstanding there and $2,500 outstanding on the team agreement.

### Phase 1 acceptance checks

- One sponsor can have several deals, including a season-level title deal and a specific event-hole placement. Existing sponsor and agreement records remain usable.
- The quote checklist recalculates on removal and restoration, protects required items, and carries the accepted total and selected benefits into the agreement. Later package edits leave accepted terms intact.
- A signed conditional commitment can count toward the configured threshold without creating a receipt. The threshold release and missed-deadline cases are covered by tests.
- A partial payment updates the correct agreement and organization totals. Corrections are traceable and receipts are counted once.
- Sponsor contact details and confidential financial terms are restricted to authorized roles. Guide access for sales staff through an explicit permission decision.

## Phase 2 — Donations, pledges, and other funding

**Goal.** Extend the funding workflow to organizations that raise money beyond paid sponsorships. Pilot it with a running event that supports a charity.

| Funding type | What the organization tracks |
| --- | --- |
| Sponsorship | A paid agreement tied to a sponsor and the benefits or placement it covers. |
| Donation | A contribution received for an organization, event, or designated beneficiary. |
| Pledge | A promise to contribute, with a promised amount, optional due date, and receipt history. |

1. **Add donations and pledges.** Capture contributor details, the amount and currency, and the event or purpose. Allow an optional beneficiary where the organization is raising funds for a charity.
2. **Apply receipts to pledges.** Link each payment to its pledge and show the remaining commitment. A $100 pledge with $40 received contributes $40 to received funding and shows $60 still pledged.
3. **Report by event, beneficiary, and funding type.** Show sponsorship commitments, outstanding pledges, and actual receipts so event organizers can reconcile what they raised. Include any additional funding type when a pilot organization has a concrete use case.

### Phase 2 acceptance checks

- A running event can record a direct donation and a partial pledge payment for the same beneficiary.
- The event report reflects each receipt once and shows the remaining pledge balance.
- Sponsorship reports continue to reconcile when the organization also accepts donations and pledges.
- Ambiguous or missing beneficiary information is visible to the admin before they rely on the report.

## Decisions to confirm as we build

- The names, prices, benefits, and required items for each of the six tiers. Confirm whether Title Sponsor maps to a numbered tier and whether discounts or manual line-price overrides are allowed.
- Whether an agreement can bundle several individually tracked placements beyond a single season-level coverage record.
- Which commitments count toward the 50% threshold, which agreements use it, and how due dates are handled when the threshold is reached after a scheduled installment date.
- Whether sales staff need a distinct quoting role and what deal terms that role may see.
- Whether Phase 2 needs online checkout, receipts, exports, or public sponsor recognition. Each is a separate product decision after the manual workflow is proven.
