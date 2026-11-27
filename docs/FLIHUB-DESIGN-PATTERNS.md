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

## DP-09 — Lucide icons and visual semantics

Use the existing lucide-svelte library throughout FliHub.

Conventions:

- Prefer recognizable icons alongside descriptive labels.
- Use consistent icons for equivalent application concepts.
- Use approximately 16px icons in compact controls.
- Use approximately 18–24px icons in prominent headings.
- Use rotating chevrons for disclosure controls.
- Use lightbulbs for recommendations.
- Use eye icons for historical retrieval and inspection.
- Use shields and locks for security restrictions.
- Use amber for attention and recommended next actions.
- Reserve green completion indicators for verified success.
- Reserve destructive styling for errors and destructive actions.
- Hide decorative icons from assistive technology.
- Provide accessible names for icon-only controls.
- Never communicate important status through icons or color alone.

Do not introduce additional icon libraries without justification.

## DP-10 — Independent workspace navigation

Use clearly separated workspace sections when a feature
contains multiple related interaction modes.

Conventions:

- Combine recognizable navigation icons with text labels.
- Clearly distinguish the selected section.
- Display only the selected workspace content.
- Preserve compatible form values when switching sections.
- Keep frequently used actions visible.
- Preserve keyboard accessibility and focus behavior.
- Avoid unnecessary requests when switching sections.

The development intelligence playground provides an initial
example using Assessment, History, Capabilities and Usage.

## DP-11 — Structured context and qualitative readiness

Present structured application facts using readable labels,
icons, compact rows and appropriate attention indicators.

Conventions:

- Prefer structured facts over dense summary paragraphs.
- Use zebra rows where they improve scanning.
- Distinguish unknown information from zero values.
- Distinguish recorded values from verified readiness.
- Highlight missing requirements using amber.
- Explain the limitations of qualitative assessments.
- Do not represent qualitative scores as official completion.
- Withhold readiness judgments when required information
  is insufficient.
- Keep recommendations separate from authorization.

## DP-12 — Historical retrieval without re-execution

Historical views must retrieve recorded results rather than
silently repeat the original operation or intelligence request.

Conventions:

- Display original timestamps and relevant context.
- Preserve original results and recommendations.
- Clearly identify historical views.
- Keep retrieval actions visible when records are collapsed.
- Provide a return path to the latest result.
- Use bounded retention appropriate to the feature.
- Distinguish historical views from new submissions.
- Clearly disclose temporary or persistent storage behavior.

Persistent history requires appropriate authorization,
privacy, retention and audit controls.

## DP-13 — Transparent resource and usage reporting

Present resource consumption and operational restrictions
using clearly labeled statistics and structured rows.

Conventions:

- Distinguish submissions from successful responses.
- Distinguish historical retrieval from new execution.
- Report unavailable and disabled outcomes separately.
- Identify configured rate and concurrency limits.
- Disclose the scope and lifetime of displayed counters.
- Distinguish local statistics from provider billing records.
- Identify synthetic data and offline provider configuration.
- Never imply that displayed restrictions independently
  establish security acceptance.

The initial development intelligence playground demonstrates
these conventions without live provider billing integration.

## DP-14 — Embedded contextual intelligence

Present optional intelligence assistance within the
relevant existing screen or structured workflow step.

Conventions:

- Prefer focused actions with descriptive labels.
- Use recognizable Lucide lightbulb icons for suggestions.
- Use amber for relevant recommendations and attention.
- Keep conventional controls visible and usable.
- Show the context and limitations of a recommendation.
- Distinguish unknown information from verified facts.
- Distinguish suggestions from applied draft selections.
- Require explicit user action before applying suggestions.
- Preserve deterministic validation and workflow dependencies.
- Invalidate stale recommendations and consequential reviews.
- Do not initiate provider requests through navigation.
- Do not repeat requests during historical retrieval.
- Preserve disabled, unavailable and abstention fallback.
- Use registered application components.
- Preserve keyboard accessibility and responsive layouts.

Intelligence must not directly mutate authoritative state,
grant permission or render provider-generated executable code.

See [Embedded Intelligence Workflow Architecture](INTELLIGENCE-WORKFLOW-ARCHITECTURE.md).

This is an architectural presentation requirement,
not a claim of completed component implementation.

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
