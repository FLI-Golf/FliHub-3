# FliHub — Intelligent Activity Configuration Roadmap

Status: Approved architectural direction. Proposed implementation phases require separate authorization. JAI-5F remains the next development priority.

## Product direction

**FliHub builds the prompt with the user.**

**FliHub guides the process.**

**Jev helps interpret requirements and improve decisions.**

**FliHub determines what is supported.**

**FliHub safely builds the approved structure.**

**Jev supplies intelligence. FliHub retains control.**

An **activity** identifies the domain, such as disc golf or charity run/walk. A **format** describes how a particular competition or event operates, such as individual, team, mixed-team, divisional, multi-round or noncompetitive participation. A **capability** provides an operational function, such as registration, teams, groups, scoring, results, standings, fantasy, prize purses and payouts, substitutions, sponsorships, fundraising, ticketing, expenses or reimbursements. These examples describe the model. Implementation and compatibility vary by activity and format.

Share platform infrastructure while preserving activity-specific rules. Future golf, pickleball and other activities follow the separate [Activity Catalog roadmap](ACTIVITY-CATALOG-ROADMAP.md).

## Initial activity baselines

- **Disc golf.** Preserve the established FLI Disc Golf League template with twelve two-athlete teams, one male and one female per team, six groups of two teams, and two rounds on a physical nine-hole course for eighteen holes played per athlete. The existing demonstration used Red and Blue positions on the same nine holes. Retain the established prize purse and payout capabilities and fantasy rules. The existing league and season setup supports an optional season purse. Keep purse amounts configurable. [League and season setup](README-LEAGUE-SEASON-SETUP.md) Preserve existing scoring, eligibility, substitution, payout and draft rules and regression-test the original format. The recorded demonstration verifies the baseline fixture and scoring workflow. [Demonstration and verification record](ROADMAP.md)
- **Charity run/walk.** Use a substantially different model to test reuse of registration, event configuration and other compatible shared capabilities. Existing charity development is frozen after CE-3C. CE-3D and subsequent gates, including CE-3E controlled activation, retain their existing authority. [Charity Event Roadmap](CHARITY-EVENT-ROADMAP.md)

Future configurations may vary athlete and team counts, team size and composition, eligibility, group structure, course layout, supported nine- or eighteen-hole rounds, number of rounds and optional capabilities such as a purse or fantasy. Discussion examples include seven individuals playing one eighteen-hole round, thirty-two mixed pairs playing three eighteen-hole rounds, sixteen two-person male teams playing two rounds, and the original FLI format. These examples establish neither present support nor new business rules.

Inspect schema, roster and group assumptions, physical holes versus played holes, scoring and published result contracts, standings, payouts, fantasy and event lifecycle before generalizing any format. Existing preset, test and demo sizes require classification as template defaults or actual domain limits.

## Templates and Guided Prompt Builder

An applicable owner-led activity or event wizard starts with an activity template containing defaults, preselected requirements, unchecked optional requirements, structured fields, supported capability candidates, required decisions and activity-specific validation. Templates give owners a starting point they can customize within supported rules. Evaluate official FliHub templates and organization-customized or reusable activity templates. Ownership, versioning, compatibility and lifecycle remain open.

The **Guided Prompt Builder** is the proposed first intelligent configuration step. It provides accessible checkboxes, editable numerical values, predefined options, blank custom statements with the ability to add more, a generated natural language description, an explicit evaluation action and a structured configuration preview. Users can accept or adapt the baseline without typing or speaking. Free-form text and voice are optional future alternatives.

For disc golf, the template might supply statements for twelve teams, one male and one female per team, nine holes per round, two rounds, and two teams per group. Purse, eligible fantasy and supported spectator ticketing are example capability statements whose defaults and visibility derive from the applicable template and registered definitions. The shared builder is activity-driven.

Selection includes a statement in the generated description. Unselection omits it. Edits to structured values update the description automatically. Keep structured selections independently of generated prose. Distinguish unspecified requirements, template defaults, explicit selections, explicit exclusions and explicit removal of existing configuration. Unchecking alone never deletes an existing value. Define exclusion and removal as distinct, reviewable actions.

## Interpretation and structured proposals

Process structured inputs deterministically. Planned athlete count, round count, holes played, group capacity and known eligibility rules can be evaluated without a paid provider. Ordinary event creation must work through structured controls when intelligence is disabled, unavailable or ineligible.

Jev can help interpret custom language, identify missing information, ambiguity and conflicts, recommend supported alternatives and explain eligibility. For example, a request for 32 mixed pairs, three eighteen-hole rounds and a $20,000 prize purse could populate several sections with a bounded proposal. This is an illustrative user-specified amount. Reliability of complex interpretation requires separate evidence. JAI-5E verified disposable synthetic execution.

A proposed contract should distinguish template defaults, explicit structured selections, explicit natural language requirements, Jev recommendations, FliHub calculations, unspecified values, ambiguous or unsupported requirements, conflicts and outstanding decisions. Preserve source and intent for consequential fields. When asked to change to 24 teams and two rounds, identify affected fields and dependencies while preserving unrelated values. Flag conflicts for resolution. Future architecture must address stale proposals, concurrent changes, configuration versioning, scoped authorization and exact approval. The final representation and API remain open.

Use bounded request and response contracts, minimized authorized data, structured output validation, explicit provider boundaries and usage and cost accounting. FliHub validates supported rules and owns any change. Jev cannot invent binding rules or capabilities, silently overwrite settings, grant permissions, execute arbitrary actions, access records directly or bypass review and validation.

## Capability Registry and Eligibility Engine

The proposed **Capability Registry** records identities, supported activities and formats, implementation availability, configuration, dependencies, incompatibilities, eligibility, lifecycle prerequisites, authorization and activation requirements. Extend or compose existing definitions where appropriate. A competing registry requires evidence of a distinct need.

Today the [shared application capability catalog](../src/lib/capabilities/catalog.json) supplies availability and dependencies to the app and PocketBase hooks. The [advisory capability registry](../src/lib/server/intelligence/application/capabilities.ts) identifies recommendation-only intelligence capabilities. The [synthetic operation registry](../src/lib/server/intelligence/application/operations/registry.ts) binds registered operations to the synthetic boundary. IAC-1 must decide what to reuse and how to preserve distinct responsibilities.

The **Capability Eligibility Engine** deterministically evaluates the selected activity, format, dependencies, actual data and lifecycle state. Enforce applicable checks server-side and re-evaluate affected capabilities when configuration or prerequisites change. For example, a seven-person individual event could remain valid while the established FLI fantasy format is ineligible. Evaluate its actual draft format, eligible athlete pools, divisions, roster requirements and other rules. The current rules use active event group athletes and apply roster composition requirements. Participant count alone is insufficient. [Existing fantasy rules](../pocketbase/pb_hooks/fantasy_rules.js) Jev may explain eligibility and suggest alternatives. FliHub owns the decision.

Distinguish implemented support, selection, configuration completeness, eligibility and operational activation. Candidate outcomes include **Available** when eligibility is met, **Planned — requirements pending** when intended prerequisites are outstanding, **Ineligible** when the configuration is incompatible, and **Not yet supported** when implementation is absent for that activity or format. Future architecture should determine the separate state dimensions. Selection or template presence confers no authority to activate.

## Adaptive Configuration Wizard and authorized creation

1. Select the activity and load its template.
2. Present default and optional statements and capture structured changes and any custom requirements.
3. Generate the description and process structured inputs deterministically. Use optional Jev assistance for interpretation or recommendations where useful.
4. Validate the structured proposal, populate applicable sections and evaluate eligibility, dependencies and lifecycle prerequisites.
5. Show missing requirements and conflicts. Let the owner complete outstanding decisions.
6. Present an exact review of consequential configuration changes and obtain required explicit approval.
7. Recheck authorization, scope, prerequisites and current version. Create the approved configuration through deterministic application operations with applicable transaction, verification and audit requirements.

Activity definitions supply terminology, templates, statements, fields, supported formats, compatibility, validation and operational prerequisites. Competition format definitions describe activity-specific structure. The wizard adapts presentation and progression to these definitions and validation results. The builder captures intent, the proposal carries reviewable values, and the registry and eligibility engine govern supported choices. Scaffolding represents planned structure. Exact review, approval and authorized operations govern consequential creation.

Existing [guided event setup](README-GUIDED-EVENT-SETUP.md), [GuidedEventSetup](../src/lib/components/GuidedEventSetup.svelte) and deterministic domain services are candidate integration points. Reuse exact review concepts from [Embedded Intelligence Workflow Architecture](INTELLIGENCE-WORKFLOW-ARCHITECTURE.md). Persistent application execution requires its existing gates. The disposable synthetic engine provides a bounded example of review and verification.

Follow [FliHub Design Patterns](FLIHUB-DESIGN-PATTERNS.md). Use existing shadcn-svelte controls and Lucide icons, clear labels, compact responsive layouts, zebra rows where helpful, amber attention indicators, collapsible sections with chevrons and accessible form controls. Explain availability and unresolved prerequisites and make review and approval explicit. FliHub owns interface rendering and behavior.

## Competition Scaffolding

Allow planning before all registrations arrive. A twelve-team event with two athletes per team might reserve planned team and athlete capacity, group structure, empty assignment slots, rounds, registration requirements and intended optional capabilities. Distinguish planned capacity, actual registrants, verified eligible participants, confirmed assignments and operational readiness. Recheck real prerequisites before activation.

Empty slots must remain distinct from participant records. Never create fake production athletes or introduce synthetic data into actual registration, scoring, standings, drafts or published results. Data representation, lifecycle transition rules and interactions with current roster requirements remain open.

## Separate future initiatives

- **Ticketing** is future spectator admission, separate from participant registration. The FLI Disc Golf League intends to sell spectator tickets. Future compatible events may select or exclude general admission, VIP or other admission products after implementation and eligibility. Until then, no ticket sales, records, payments or admission features may be activated through templates or Jev. Pricing, VIP benefits, processing, refunds, inventory, scanning, enforcement and reconciliation belong to separately authorized ticketing work.
- **Activity Catalog expansion** governs new activity implementations. Extensible definitions should let the builder and wizard reuse activity inputs and validation without rewriting shared components or bringing catalog expansion into IAC scope. [Activity Catalog Roadmap](ACTIVITY-CATALOG-ROADMAP.md)
- **Intelligent Organization Configuration** is a separate future wizard for organization structure, selected activities, membership, governance, branding, operations and organization capabilities. It may reuse the builder, templates, proposals, eligibility, adaptive configuration and review. Activity and event configuration comes first. Organization wizard design and implementation require separate authorization.

## Proposed phases and acceptance

| Phase                                                                  | Scope and acceptance                                                                                                                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IAC-1 — Architecture and existing capability assessment                | Inventory actual support, fixed format assumptions, schema, authorization and lifecycle rules. Identify reusable components, registries and unresolved decisions. |
| IAC-2 — Activity templates and configurable requirements               | Define defaults, optional requirements and supported fields using activity-specific definitions. Verify provenance and compatibility.                             |
| IAC-3 — Reusable Guided Prompt Builder                                 | Verify accessible structured controls, description synchronization, omission and exclusion semantics, and a no-typing baseline path.                              |
| IAC-4 — Structured Jev configuration interpretation                    | Test bounded proposals, ambiguity, conflicts, unavailable assistance and deterministic fallback. Preserve provider approval, disclosure and cost gates.           |
| IAC-5 — Capability eligibility and dependency engine                   | Verify server-enforced compatibility, dependencies, actual prerequisites and re-evaluation. Unsupported options stay inactive.                                    |
| IAC-6 — Adaptive event wizard integration                              | Verify section selection, targeted changes, stale proposal rejection, outstanding decisions and exact approval through existing authorization.                    |
| IAC-7 — Competition scaffolding and planned capacity                   | Verify support for empty slots and planned groups and rounds, using real eligibility for activation and excluding synthetic participants from production data.    |
| IAC-8 — Disc golf integration and regression verification              | Preserve the verified FLI format and verify any separately approved variants end to end.                                                                          |
| IAC-9 — Charity run/walk integration                                   | Verify reuse under charity authorization, privacy and capability restrictions after applicable charity gates.                                                     |
| IAC-10 — Reusable organization-owned activity templates and acceptance | Verify template versioning, ownership, compatibility, tenant isolation and legacy regression. This phase covers activity templates.                               |

Refine phase dependencies during IAC-1. For example, establish a deterministic eligibility contract before testing Jev recommendations against it, even if full implementation comes later. Persistent mutations and activation require independently authorized gates. IAC-10 does not authorize the separate organization configuration wizard.

Open decisions include registry composition, template provenance and effective versions, eligibility state dimensions, how planned slots interact with real registration, schema and rule migration strategy, and how exact review binds concurrency and targeted changes. These require source assessment and acceptance criteria before choosing implementation mechanisms.
