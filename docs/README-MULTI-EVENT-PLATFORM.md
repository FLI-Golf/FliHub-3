# Multi-Sport and Multi-Event Platform Plan

Review checkpoint: see [MULTI-EVENT-ASSESSMENT.md](MULTI-EVENT-ASSESSMENT.md) for source findings and the recommended first increment. Reuse [completed account onboarding](README-ACCOUNT-ONBOARDING.md); account activity choices remain separate from organization/competition configuration. See [DECISIONS.md](DECISIONS.md) and [ROADMAP.md](ROADMAP.md) for boundaries and sequencing.

Status: Proposed direction for review. This document describes planned architecture and product behavior; it does not mean these workflows are implemented.

## Purpose

Expand FliHub beyond disc golf to support sports and other competitions, including golf, bowling, pickleball, baseball, basketball, archery, races, dog shows, car shows, and beauty pageants.

Build on the existing organization, permissions, competition, results, and fantasy foundations. Preserve the working golf experience while introducing other event types deliberately.

## Guiding principles

- Share common operations across event types without forcing every event into golf terminology or rules.
- Separate the activity, competition format, entry type, and result method.
- Use templates to suggest useful settings and familiar language.
- Make optional features optional. A single judged show does not need a league, teams, or fantasy.
- Distinguish implemented support from planned support. Changing a label does not implement a new scoring or timing system.
- Preserve server-enforced permissions, organization boundaries, audit history, and published-result integrity.
- Treat missing results as missing, never as zero or an automatic placing.
- Keep setup and event operation practical on a phone.

## Shared foundation

Conceptually:

**Organization → optional competition or series → event → entries → results**

An event can stand alone or belong to a league, season, series, or tournament structure. The exact mapping to existing collections must be reviewed before schema changes.

Shared services can include:

- Accounts, verified access, invitations, roles, and membership history.
- Organizations and configurable capabilities.
- Entry registration, eligibility, divisions, classes, and categories.
- Scheduling, locations, assignments, and event operations.
- Result entry, submission, review, publication, and versioned corrections.
- Standings, placements, awards, and public event pages.
- Optional fantasy experiences where an appropriate rule set exists.

## Four separate setup decisions

### 1. Activity or event type

Examples: disc golf, golf, running, bowling, pickleball, baseball, basketball, archery, dog show, car show, and beauty pageant.

The selection suggests terminology and supported rules. It must not silently change existing event rules or historical results.

### 2. Competition format

Examples: ongoing league, season, race series, tournament, single event, or judged show.

Activity and format are independent. Golf can have a league or a single tournament; a car show can be a standalone event or part of a series.

### 3. Entry type

An entry represents what competes. It may be:

- An individual participant or contestant.
- A team, pair, or relay team.
- An animal associated with an owner or handler.
- A vehicle associated with an owner or exhibitor.
- Another exhibit or submitted item.

Accounts represent people who use the application. A competing entry does not necessarily have an account. Keep account permissions separate from the identity and ownership of a competing entry.

Do not rename every existing athlete record to entry or reuse athlete-specific fields for animals and vehicles without a reviewed data model and migration plan.

### 4. Result method

Support should be introduced through explicit, validated rule sets. Possible methods include:

- Strokes, with the lowest score winning.
- Elapsed time, with the fastest valid time winning.
- Points or totals, with the highest score winning.
- Head-to-head games, matches, wins, and losses.
- Measurements, such as distance or height.
- Judged criteria, potentially with weights or multiple judges.
- Voting, subject to defined eligibility and counting rules.
- Recorded placements or category awards without a numeric score.

Each supported rule set must define required inputs, completeness, aggregation, ranking direction, ties, penalties, and exceptional outcomes such as withdrawals or disqualifications. These rules vary by activity and format.

## Example configurations

These examples guide design; they are not claims of implemented support or complete sport regulations.

| Activity              | Competing entries             | Typical event structure           | Result method                       |
| --------------------- | ----------------------------- | --------------------------------- | ----------------------------------- |
| Golf / disc golf      | Individuals or teams          | Courses, holes, rounds            | Strokes; lowest wins                |
| Running               | Individuals or relay teams    | Distances, routes, waves          | Elapsed time                        |
| Bowling               | Individuals or teams          | Games and series                  | Pin totals; highest wins            |
| Pickleball            | Individuals or pairs          | Games, matches, brackets or pools | Match results under selected rules  |
| Baseball / basketball | Teams                         | Games and seasons                 | Game scores and competition records |
| Archery               | Individuals or teams          | Ends, rounds, divisions           | Points under selected rules         |
| Dog show              | Dogs linked to handlers       | Classes and judging sessions      | Judging, placements, awards         |
| Car show              | Vehicles linked to exhibitors | Categories and judging sessions   | Judging, voting, or awards          |
| Beauty pageant        | Contestants                   | Categories and judging rounds     | Judged criteria and placements      |

## Organization setup experience

Proposed setup sequence:

1. Enter the organization name.
2. Choose an activity or event type, with a general/custom option.
3. Choose the intended competition format.
4. Review suggested capabilities and required dependencies.
5. Configure only the details needed for the selected, supported workflow.

An organization may eventually operate more than one activity. Whether activity defaults belong at organization, competition, or event level remains a design decision. Avoid making the initial organization choice a permanent restriction.

Use a small number of understandable choices. Advanced rules belong in the relevant competition or event settings rather than the first organization screen.

## Capabilities and terminology

Review the shared capability catalog and current templates before implementation.

| Shared concept        | Example wording or behavior                                               |
| --------------------- | ------------------------------------------------------------------------- |
| Competing identities  | Athletes, participants, contestants, animals, vehicles, or exhibits       |
| Teams and groups      | Teams, pairs, relays, or clubs where applicable                           |
| Competition structure | Leagues, seasons, series, or tournaments where applicable                 |
| Locations and layouts | Courses and holes, routes, lanes, courts, fields, rings, or display areas |
| Event organization    | Rounds, heats, waves, classes, matches, or judging sessions               |
| Result entry          | Score entry, timing, measurement, judging, voting, or placement entry     |
| Standings and awards  | Leaderboards, placements, series standings, or category awards            |
| Fantasy               | Optional and offered only for supported entry and scoring models          |

Presentation labels can vary while stable internal identifiers remain unchanged where appropriate. Permissions and capability dependencies must be enforced on the server regardless of displayed labels.

Unsupported workflows must be marked Planned or Upcoming and must not appear operational merely because their capability is selected.

## Results, publication, and history

Extend the existing review and publication model where applicable:

- Validate all required inputs before approving a complete result.
- Publish a numbered result version with the inputs and rules needed to explain it.
- Preserve previous published results while a correction is prepared.
- Require a recorded reason and reapproval for corrections.
- Snapshot relevant scoring context so later configuration changes do not alter published history.
- Define whether an event produces overall standings, category standings, multiple awards, or some combination.

Judging, timing, and voting require their own permissions and validation. Their operational details must be designed before those workflows become Available.

## Golf and fantasy conventions to preserve

For the implemented event fantasy scoring workflow:

- Golf fantasy scores use **strokes minus par**.
- Under par is negative, even par displays as E, and over par is positive.
- The lowest complete total wins.
- Equal totals share a rank under the current ranking policy.
- Missing or incomplete scores do not become zero and do not receive a complete rank.
- Standings use published official result versions and saved scoring context.
- Published corrections replace the relevant contribution rather than adding a duplicate.
- Existing roster locks and permission checks remain enforced.

Do not generalize this golf convention to other activities. Each future fantasy workflow needs an explicit policy for eligible entries, rosters, scoring, ties, and corrections.

See `MASTER_SCORING.md` and `README-FANTASY-SCORING.md` for the existing scoring plan and implementation details.

## Implementation plan

### Phase A — Review and agree on the model

- Inspect the shared capability catalog, onboarding templates, organization settings, navigation, and server capability checks.
- Identify golf-specific assumptions in athlete, team, course, round, score, result, and fantasy data.
- Document what is reusable, what needs extension, and what requires a new model.
- Agree on the first additional activity and a narrow end-to-end workflow.
- Record decisions in `DECISIONS.md` and reflect the agreed scope in `ROADMAP.md`.

### Phase B — Improve setup and capability descriptions

- Separate activity selection from competition format in the agreed design.
- Provide suitable labels and defaults for supported workflows.
- Correct stale descriptions, including references that still describe event fantasy scoring as future work.
- Clearly identify unsupported capabilities and avoid misleading setup choices.
- Preserve current organizations and their selected capabilities.

### Phase C — Implement one additional workflow

- Define entry identities, event structure, result inputs, ranking, and publication behavior.
- Implement the required backend rules and frontend operations.
- Add only necessary schema migrations, with a data-preservation plan.
- Verify the complete workflow from setup to published results and corrections.

### Phase D — Expand from demonstrated reuse

- Add further activities using proven shared components.
- Introduce specialized timing, judging, match, measurement, voting, and award workflows as separate supported increments.
- Add fantasy support only where its product and scoring rules are agreed.

## Validation expectations

For each implemented increment:

- Run type checking, lint, and the production build.
- Run relevant permission, data-integrity, and integration tests.
- Verify organization isolation and restrictions for each operational role.
- Verify missing inputs, ties, corrections, and relevant exceptional outcomes.
- Check mobile and keyboard operation.
- Verify that existing golf setup, scorekeeping, published results, drafts, and fantasy standings still work.
- Confirm production descriptions and walkthroughs match implemented behavior.

## Decisions still open

- Which activity and competition format should be implemented next?
- Where should activity defaults live, and how should mixed-activity organizations work?
- Which entry types share a model, and which require dedicated records?
- How should roles such as judge, timer, handler, exhibitor, and coach relate to existing permissions?
- Which result rules are configurable, and which require a dedicated validated implementation?
- How should categories, eligibility, awards, ties, and disqualifications be represented?
- What migration approach preserves existing athlete and competition relationships?

## Immediate next action

Review the current organization templates and shared capability catalog against this document before writing implementation code. Select the next supported workflow and agree on its boundaries first.
