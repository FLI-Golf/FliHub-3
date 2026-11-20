# FliHub funding roadmap

## Purpose

Give each organization a way to see who is funding its activities, what the funding covers, how much was committed, and how much has actually been received. FLI Golf starts with paid sponsorships. Other organizations can use the same workflow for donations and pledges in Phase 2.

## Where the app stands today

**Sponsorships** is an organization-level sales tracker for owners and admins. It stores sponsor contact details, sales stage, follow-up date, next action, and notes. The stages are Prospect, In discussion, Proposal sent, Signed, and Closed. A sponsor record can be archived and restored.

A **Signed** stage describes the relationship with the sponsor. The current form has no agreement amount, payment history, or assignment to a hole, team, event, league, or season.

## Phase 1 — Paid sponsorships for FLI Golf

**Goal.** Track a paid sponsorship from the signed agreement through the final payment.

1. **Add an agreement from the sponsor record.** Reuse the existing contact. Record the agreement title, agreed amount, currency, signing date, payment due date, and a short description of the benefits promised. A sponsor can have multiple agreements.
2. **Choose what the agreement covers.** Support organization, league, season, team, event, and a hole at a specific event. Resolve the hole against the selected event layout. If the event plays the same physical hole more than once, allow the admin to specify the round or cover every applicable round. Show the scope in the agreement list.
3. **Record payments as they arrive.** Start with manual entry for payments received outside FliHub. Capture amount, date, method, and reference. Preserve who recorded each payment and its correction history. Store monetary values in minor currency units and calculate received and outstanding amounts from the payment history.
4. **Show funding progress.** On the sponsor page, show every agreement with its agreed, received, and outstanding amounts. Give owners and admins an organization view they can filter by sponsor, season, event, or payment status. Report totals per currency.

**Pilot example.** A company signs a $1,000 agreement for Hole 7 at one FLI Golf event and a separate $2,500 agreement for a team’s season. A $400 payment against the hole agreement leaves $600 outstanding there. The team agreement still shows $2,500 outstanding.

### Phase 1 acceptance checks

- One sponsor can have both agreements without duplicating its contact record. Existing sponsor records still work through the sales tracker.
- The hole agreement appears under the correct event and hole. The team agreement appears under the intended season. Cross-organization targets and invalid hole selections are rejected.
- Partial payments, final payments, and corrections reconcile to the agreement balance and organization totals. The sponsor’s sales stage alone never changes the received total.
- Owners and admins can manage agreements and payments. Private contact details, terms, and payment records stay within the organization’s authorized views.

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

- Whether a Phase 1 agreement may cover several placements or should use one agreement per placement for the pilot.
- Whether Phase 2 needs online checkout, receipts, exports, or public sponsor recognition. Each is a separate product decision after the manual workflow is proven.
