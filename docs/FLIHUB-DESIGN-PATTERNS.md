# FliHub — Design Patterns

## Purpose

Establish a consistent visual and interaction language
for existing and future FliHub functionality.

These conventions apply to manual development,
authorized AI engineering, guided workflows, and
future Jev-assisted application interfaces.

## Core principles

- Preserve existing working interfaces.
- Prefer reusable Svelte components.
- Use existing Tailwind and shadcn-svelte conventions.
- Maintain consistent visual and interaction patterns.
- Support desktop administration and mobile operations.
- Avoid unnecessary duplication of components.
- Keep business rules independent of presentation.
- Keep intelligence optional.

## DP-01 — Collapsible configuration sections

Use expandable and collapsible sections to organize
complex configuration screens.

Conventions:

- Provide a recognizable section heading.
- Use chevrons to communicate expansion state.
- Keep important summaries visible when collapsed.
- Preserve entered values when sections close.
- Use accessible disclosure controls.
- Do not hide validation errors from the user.

Existing references:

- GuidedEventSetup.svelte
- OrganizationSetupChecklist.svelte

## DP-02 — Amber-driven guidance

Use amber to communicate attention, incomplete
requirements, and recommended next actions.

Conventions:

- Highlight the relevant action or configuration.
- Use amber borders, rings, and supporting messages.
- Avoid highlighting every available action.
- Distinguish attention from errors and completion.
- Never rely on color alone to communicate status.

Existing reference:

- GuidedEventSetup.svelte

Blue remains appropriate for selected navigation,
active progress steps, and informational presentation.

## DP-03 — Multi-step forms

Use progressive forms for complex configuration.

Conventions:

- Display the current step and overall sequence.
- Validate required inputs before advancing.
- Preserve compatible answers when moving backward.
- Clear incompatible dependent answers.
- Explain when previous changes invalidate later answers.
- Provide a review step before consequential submission.
- Preserve keyboard navigation and focus management.

Existing references:

- SetupWizard.svelte
- GuidedEventSetup.svelte
- LeagueSeasonSetup.svelte
- src/lib/setup/preview.ts

## DP-04 — Adaptive workflow guidance

Future intelligent workflows may recommend a different
eligible next step based on verified application context.

Mandatory prerequisites remain deterministic.

Jev may recommend:

- Relevant existing screens.
- Eligible next actions.
- Missing prerequisites.
- Appropriate registered presentation patterns.

Jev must not bypass validation, permissions, required
approvals, or mandatory workflow dependencies.

Manual and guided workflows remain available.

## DP-05 — Compact information hierarchy

Preserve established FliHub preferences:

- Compact navigation.
- Readable bold labels.
- Stacked count badges where appropriate.
- Zebra-pattern management tables.
- Responsive layouts.
- Clear status and completion indicators.
- Minimal unnecessary visual clutter.

Existing navigation references:

- OrgNav.svelte
- NavigationCountBadges.svelte

Additional table and form examples should be inventoried
before extracting shared presentation components.

## DP-06 — Honest progress and status

Distinguish:

- Not started.
- In progress.
- Records found.
- Ready to verify.
- Complete.
- Blocked.
- Disabled.
- Not checked.

Record presence does not establish workflow readiness.

Do not invent completion percentages or imply that
planned functionality is implemented.

Existing references:

- src/lib/setup/checklist.ts
- src/lib/data/planned-features.ts
- OrganizationSetupChecklist.svelte

## DP-07 — Activity-specific terminology

Use terminology appropriate to the activity.

Examples:

- Athletes for sporting competition.
- Participants for charity run/walk.
- Contestants for pageants.
- Exhibitors and vehicles for car shows.
- Handlers and animals for dog shows.

Only the existing athlete and charity participant
terminology mapping is currently established by
the inspected organization profile module.

Future terminology requires explicit implementation.

Existing reference:

- src/lib/organizations/profiles.ts

## DP-08 — Registered presentation patterns

Future application intelligence may recommend an
approved presentation pattern from a bounded catalog.

Candidate patterns:

- Collapsible configuration section.
- Sequential setup wizard.
- Readiness checklist.
- Recommendation panel.
- Review and confirmation panel.
- Management table.
- Status and completion indicator.

The application renders approved components.

Do not execute provider-generated Svelte, HTML,
JavaScript, or arbitrary interface instructions.

## Verification

Future design changes should verify:

- Consistency with existing components.
- Responsive behavior.
- Keyboard accessibility.
- Focus management.
- Validation visibility.
- Honest status presentation.
- Existing manual workflow compatibility.

This document records initial conventions and inspected
examples. It is not a completed component audit.
