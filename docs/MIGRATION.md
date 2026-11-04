# Migration from the previous prototype

FliHub was previously prototyped with React and Supabase on another development
service. This repository is a deliberate rebuild on SvelteKit + PocketBase, not
a port. Reusable requirements, assets, and business rules will be preserved;
implementation code will not.

## Rules

- **Treat all previous implementation claims as unverified until audited.**
  Do not claim that previous features or data have been migrated until the
  actual implementation here has been verified end to end.
- **Do not copy** Supabase SQL, RLS policies, or React components into this
  application. Translate business requirements into PocketBase collections,
  API rules, migrations, and SvelteKit code instead.
- **Do not recreate missing assets** or silently substitute invented records
  for data that has not been exported.

## Exports still needed from the previous project

| Export                                                | Status       | Notes                                               |
| ----------------------------------------------------- | ------------ | --------------------------------------------------- |
| Complete milestone document                           | **Received** | Preserved at [Milestones.md](../Milestones.md).     |
| Application source code (for reference only)          | Pending      | Used to audit requirements; never copied directly.  |
| Database schema and migrations                        | Pending      | Basis for translating business rules to PocketBase. |
| Team branding, logos, player photos, and other assets | Pending      | Reuse where available; do not fabricate.            |
| Demo data and import formats                          | Pending      | Needed for the disc golf demonstration seed data.   |

## Import approach (planned)

1. Audit the previous schema against Milestones.md to extract confirmed
   business rules.
2. Design PocketBase collections (sport-neutral shared models; disc golf team
   and scoring rules stay demonstration-specific).
3. Commit reproducible PocketBase migrations under `pocketbase/pb_migrations/`.
4. Import assets and demo data with a documented, repeatable script; record
   exactly what was imported and what could not be.
