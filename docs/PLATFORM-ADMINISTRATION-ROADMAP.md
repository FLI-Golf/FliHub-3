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

PocketBase superuser accounts are separate privileged infrastructure identities. Platform Administrator is the application role name.

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

Plan a separate protected Platform Administration experience with independently authorized access and navigation. Proposed areas are Overview, Organizations, Users, Intelligence, System health, Usage and costs, Security, Audit history, and Settings.

Platform Administrators may receive an explicit capability to view the organization directory across tenants without joining or owning those organizations. Start with read-only oversight wherever practical. Sensitive organization records and administrative mutations require separately defined authorization, including applicable confirmation and audit requirements.

## Intelligence boundaries

**Jev supplies intelligence. FliHub retains control.**

**FliHub guides the process. Jev helps improve the decisions.**

- **Organization-facing intelligence** supports guided organization creation, contextual wizard assistance, event preparation, prerequisite assessment, sponsorship assistance, activity-specific recommendations and operational guidance. Structured Svelte workflows remain the primary interface. Jev supplies optional contextual assistance at appropriate points, with manual fallback.
- **Platform-facing intelligence administration** covers provider configuration oversight, capability availability, usage and cost monitoring, intelligence policy administration, system diagnostics, and security and audit oversight. These responsibilities require explicit platform capabilities.

Both areas may reuse the intelligence foundation while enforcing separate authorization and data access. FliHub owns authorization and privileged actions. Jev must never independently grant permissions, expand resource access, approve privileged operations or determine platform authorization.

Existing organization accounts, including development demonstration accounts, may temporarily participate in explicitly allowlisted protected intelligence testing. The allowlist confers only the existing workspace access and grants no Platform Administrator authority. Preserve the protected development workspace security boundaries, including development-only access, synthetic fixtures and disabled-by-default enablement. Future platform administration must keep development tooling and synthetic testing out of production.

## Deferred development sequence

Each phase remains deferred until separately authorized. Current priorities and acceptance gates remain governed by the [Platform Development Roadmap](PLATFORM-DEVELOPMENT-ROADMAP.md).

| Phase                                                 | Deliverable                                                                                                                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PA-1 — Architecture and authorization requirements    | Inspect existing authorization, define capability and resource boundaries, establish security requirements and record implementation decisions.                   |
| PA-2 — Secure platform administrator foundation       | Implement approved application-level authorization, secure provisioning and revocation, and authorization regression coverage.                                    |
| PA-3 — Protected administration console               | Add a separately authorized interface and navigation.                                                                                                             |
| PA-4 — Organization and user oversight                | Add authorized organization directory visibility and bounded account oversight, starting with read-only access wherever practical.                                |
| PA-5 — Intelligence administration and usage controls | Add authorized intelligence configuration, capability oversight, usage monitoring and cost controls.                                                              |
| PA-6 — Audited support and administrative operations  | Add explicitly authorized operations with confirmation, accountability and auditing appropriate to each operation.                                                |
| PA-7 — Production security and acceptance             | Verify authorization, cross-organization isolation, privilege escalation resistance and audit behavior. Complete operational readiness and production acceptance. |
