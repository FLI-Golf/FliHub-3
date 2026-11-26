# FliHub — Branding and Media Roadmap

Date: November 26, 2026.

Status: Requirements captured. Architecture and implementation deferred.

Proposed branch: `feature/branding-foundation`.

## Objective

Establish a reusable platform branding capability
that supports appropriate FliHub entities, media assets,
brand inheritance and sponsorship presentation.

Branding should be integrated into ordinary application
workflows rather than treated as unrelated image fields
implemented independently for every entity.

## Candidate entity coverage

| Entity         | Potential branding requirements                                |
| -------------- | -------------------------------------------------------------- |
| Organization   | Logo, colors, banner and visual identity                       |
| League         | League identity and inherited branding                         |
| Season         | Seasonal identity and promotional artwork                      |
| Event          | Event logo, banner and promotional assets                      |
| Team           | Logo, colors and uniform identity                              |
| Athlete        | Profile photograph, personal identity and sponsor affiliations |
| Participant    | Optional profile and fundraising identity                      |
| Course         | Course identity and photographs                                |
| Venue          | Venue identity, imagery and signage                            |
| Hole           | Hole imagery, signage and eligible sponsor placements          |
| Sponsor        | Logo, colors and promotional assets                            |
| Fantasy league | League identity and promotional imagery                        |

This is an initial requirements inventory.

Actual supported entities, fields, permissions and
relationships require source inspection and architecture review.

## BR-1 — Branding architecture and discovery

Inventory existing entity models, media fields,
file storage, sponsorship coverage and public pages.

Distinguish:

- Brand identity: the identity of an entity.
- Media assets: logos, photographs, banners and artwork.
- Brand inheritance: resolution of permitted defaults.
- Brand placement: where an identity or asset appears.
- Presentation: how approved branding is rendered.

Determine which concepts can be shared across entities.

Do not finalize database schemas before inspecting
existing PocketBase models and domain relationships.

## BR-2 — Media and identity foundation

Define supported asset types and metadata.

Candidate requirements:

- Logos and profile photographs.
- Banners and promotional imagery.
- Primary and secondary brand colors.
- Accessible alternative text.
- Asset ownership and organization scope.
- Visibility and publication status.
- Replacement, removal and lifecycle management.

Establish upload validation, file size limits,
safe file handling and access control.

Define public versus protected media behavior.

Consider image dimensions, transformations, storage
limits, caching and orphaned asset cleanup.

Do not assume that all uploaded media is public.

## BR-3 — Branding inheritance

Support appropriate inherited defaults and
entity-specific branding overrides.

Potential relationships include:

- Organization to league.
- League to season.
- Season to event.
- Organization or league to team.
- Course to hole.

These are candidate relationships, not approved
inheritance rules.

Determine:

- Which properties may be inherited.
- Which relationships permit inheritance.
- Explicit override and reset behavior.
- Precedence when multiple relationships apply.
- How changes to parent branding affect descendants.
- How published historical presentation is preserved.
- How cross-organization ownership is protected.
- How invalid relationships and cycles are prevented.

Athlete identities and sponsor identities must not
be silently replaced by unrelated inherited branding.

FliHub owns deterministic inheritance resolution.

## BR-4 — Guided branding configuration

Integrate branding into relevant existing workflows.

Potential organization setup sequence:

1. Establish organization identity and purpose.
2. Configure optional visual identity.
3. Review inherited branding defaults.
4. Configure eligible sponsor presentation.
5. Review and confirm the selected configuration.

Preserve the ability to skip optional branding.

Do not require AI assistance or media uploads
to complete otherwise valid organization creation.

Follow existing guided workflow and design patterns.

## BR-5 — Sponsorship branding and placements

Integrate with existing sponsorship agreements,
coverage relationships and funding functionality.

Candidate placement surfaces:

- Organization and league public pages.
- Event public pages.
- Course and hole information.
- Digital scorecards.
- Event signage and promotional presentation.
- Team and athlete sponsor presentation.

Define placement eligibility, visibility, duration,
priority and contractual requirements.

Do not equate a sponsor logo upload with an approved
sponsorship agreement or authorized placement.

Do not create financial obligations or alter agreements
through branding configuration alone.

## BR-6 — Public presentation and accessibility

Define reusable registered branding components.

Support responsive presentation and safe defaults
when branding is absent.

Preserve readable text, appropriate color contrast,
keyboard accessibility and meaningful image descriptions.

Do not allow arbitrary uploaded scripts, styles
or executable provider-generated presentation.

Preserve existing operational interface conventions.

## BR-7 — Optional embedded Jev assistance

Potential intelligence assistance includes:

- Asking relevant contextual branding questions.
- Explaining available branding options.
- Suggesting complementary color combinations.
- Recommending appropriate inheritance choices.
- Identifying missing branding information.
- Suggesting eligible sponsor placements.
- Explaining conflicts between proposed configurations.
- Recommending suitable promotional presentation.

FliHub defines supported questions, permitted answers,
inheritance rules, placement eligibility and validation.

Jev may recommend among eligible choices or
request clarification through registered contracts.

Jev must not invent unsupported configuration,
silently apply recommendations, grant permissions
or publish branding.

Provider access to photographs, logos, private
participant information or other new data categories
requires separate approval.

Image generation is a separate potential capability,
not an established Jev capability or an authorized
part of this roadmap.

Conventional branding configuration remains available
when intelligence is disabled or unavailable.

See [Embedded Intelligence Workflow Architecture](INTELLIGENCE-WORKFLOW-ARCHITECTURE.md).

## BR-8 — Acceptance and closeout

Future acceptance must verify:

- Tenant isolation and entity ownership.
- Authorized upload and asset retrieval.
- Safe file handling and visibility.
- Deterministic inheritance and override behavior.
- Sponsor placement authorization.
- Existing public page and operational compatibility.
- Responsive and accessible presentation.
- Manual fallback without intelligence.
- Validated intelligence recommendations, if enabled.
- Transaction and audit requirements.
- Relevant legacy regression.
- GitHub CI and review evidence.

## Deferred decisions

The following remain unresolved:

- Existing media capability inventory.
- Shared versus entity-specific storage models.
- Exact inheritance hierarchy and precedence.
- Branding versioning and historical presentation.
- Asset transformation and delivery architecture.
- Sponsor placement inventory and conflict resolution.
- Initial implementation scope and pilot entity.
- Embedded intelligence context and provider contracts.

No implementation, migration, provider request
or production activation is authorized by this document.

Review this initiative after JAI-5H alongside the
[Platform Development Roadmap](PLATFORM-DEVELOPMENT-ROADMAP.md).
