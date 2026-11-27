# FliHub — Platform Administration Architecture and Roadmap

Status: Approved architectural direction. Each implementation phase requires separate authorization.

## Terminology and authorization scopes

| Scope        | Official terminology       | Responsibility                                                                         |
| ------------ | -------------------------- | -------------------------------------------------------------------------------------- |
| Platform     | Platform Administration    | The development area for administering FliHub as a platform.                           |
| Platform     | Platform Administrator     | The application-level role for explicitly authorized FliHub-wide oversight.            |
| Organization | Organization Owner         | Ownership and management of an individual organization.                                |
| Organization | Organization Administrator | Delegated management within an organization.                                           |
| Organization | Organization Viewer        | Authorized read-only access within an organization.                                    |
| Activity     | Activity-specific roles    | Narrow operational responsibilities, including scorekeepers and fantasy commissioners. |

PocketBase `_superusers` are separate privileged infrastructure identities. Platform Administrator is the everyday application role name. Keep infrastructure credentials and unrestricted PocketBase authority outside the application console. Future design must preserve separation between application and infrastructure privileges.

Platform scope may cover the organization directory, user account oversight, platform health and diagnostics, intelligence provider administration, capability availability, usage and costs, security and audit oversight, platform configuration, and audited customer support operations. Each responsibility requires defined capabilities and resource boundaries.

Organization scope preserves existing ownership, administration, membership, viewer permissions and tenant isolation. Organization Owner authority remains scoped to the organization. Platform Administrator status alone grants neither organization membership nor organization mutation authority. Access across organizations and access to sensitive records require explicit scope and authorization.

Activity scope preserves existing operational authorization. Define narrowly scoped capabilities for future activities when concrete responsibilities warrant them. Introduce additional roles only when distinct responsibilities justify them.

## Roles and capabilities

**Roles describe responsibility. Capabilities determine authorized actions.**

Start with predefined, server-enforced capability mappings. Defer a custom permissions editor until operational requirements justify it. Authorization must evaluate the authenticated identity, requested capability, resource scope and relevant application state. Apply least privilege, explicit authorization and appropriate auditing. Preserve tenant isolation and existing activity-specific checks. Exclude implicit cross-organization access, unrestricted impersonation and automatic organization mutation authority.

## Platform Administrator foundation

Plan for one application-level Platform Administrator role. Introduce additional platform roles only when concrete operational, security or delegation needs justify them.

Before implementation, evaluate secure initial provisioning, administrator assignment and revocation, privilege escalation prevention, fresh authentication for sensitive operations, server-side checks, cross-organization boundaries and sensitive information minimization. Define administrative audit requirements, account recovery and emergency access, and production security and operational acceptance criteria. Schema and implementation mechanism decisions belong to separately authorized work.

## Future console

Plan a separate protected Platform Administration experience with independently authorized access and navigation. Proposed areas are Platform overview, Organizations, Users, Activity and capability administration, Intelligence administration, System health, Usage and costs, Security, Audit history, and Settings. These are candidate navigation areas. Each view and action needs its own scope and authorization requirements.

Platform Administrators may receive an explicit capability to view the organization directory across tenants without joining or owning those organizations. Start with read-only oversight wherever practical. Sensitive organization records and administrative mutations require separately defined authorization, including applicable confirmation and audit requirements.

## Intelligence boundaries

**Jev supplies intelligence. FliHub retains control.**

**FliHub guides the process. Jev helps improve the decisions.**

- **Organization-facing intelligence** supports guided organization creation, contextual wizard assistance, event preparation, prerequisite assessment, sponsorship assistance, activity-specific recommendations, capability explanations, authorized operation preparation and operational guidance. Structured Svelte workflows remain the primary interface. Jev supplies optional contextual assistance at appropriate points, with manual fallback.
- **Platform-facing intelligence administration** covers provider configuration and availability, capability registration and governance, usage and cost monitoring, intelligence policy administration, system diagnostics and operational health, and security and audit oversight. These responsibilities require explicit platform capabilities.

Both areas may reuse the intelligence foundation while enforcing separate authorization and data access. FliHub owns authorization and privileged actions. Jev must never independently grant permissions, expand resource access, approve privileged operations or determine platform authorization.

Existing organization accounts, including development demonstration accounts, may temporarily participate in explicitly allowlisted protected intelligence testing. The allowlist confers only the existing workspace access and grants no Platform Administrator authority. Preserve the protected development workspace security boundaries, including development-only access, synthetic fixtures and disabled-by-default enablement. Future platform administration must keep development tooling and synthetic testing out of production.

## Deferred development sequence

Each phase requires separate authorization. The [Platform Development Roadmap](PLATFORM-DEVELOPMENT-ROADMAP.md) governs priorities and acceptance gates.

| Phase                                                  | Objective and dependency                                                                                              | Security and acceptance                                                                                                     | Exclusions                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| PA-1 — Architecture and authorization requirements     | Inspect existing application and infrastructure boundaries. Define role, capability, resource and state requirements. | Review provisioning, revocation, tenant isolation, fresh authentication, least privilege, audit and recovery requirements.  | Role creation and schema choice in this checkpoint.                             |
| PA-2 — Secure Platform Administrator foundation        | Implement separately approved application authorization after PA-1.                                                   | Verify provisioning, assignment, revocation, denied escalation, server checks and infrastructure separation.                | Console and unrestricted infrastructure access.                                 |
| PA-3 — Protected Platform Administration console       | Establish separately authorized navigation after PA-2.                                                                | Verify direct route and action authorization, data minimization and production exclusion of development tools.              | Directory and mutation authority conferred through navigation.                  |
| PA-4 — Organization and user oversight                 | Start with read-only directory and bounded account oversight after the platform foundation.                           | Verify resource boundaries and sensitive-field exclusions. Directory access does not create membership.                     | Unrestricted records, impersonation and mutation.                               |
| PA-5 — Intelligence administration, usage and costs    | Add approved provider and capability oversight on the protected foundation, subject to provider and usage gates.      | Verify separate authorizations, minimized provider metadata, cost controls and configuration audit.                         | Credential exposure, automatic provider activation and development tool access. |
| PA-6 — Bounded administrative and support operations   | Introduce individually approved operations after PA-1 through PA-4 and applicable PA-5 controls.                      | Require scoped authorization, appropriate fresh authentication, confirmation and auditable outcomes. Verify negative cases. | Blanket impersonation and unrestricted mutation.                                |
| PA-7 — Production security and acceptance verification | Review relevant prior phases and production gates.                                                                    | Verify tenant isolation, escalation resistance, audit, recovery and operational readiness.                                  | Implicit enablement, merge or deployment.                                       |
