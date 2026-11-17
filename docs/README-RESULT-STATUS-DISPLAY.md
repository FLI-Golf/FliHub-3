# Official-result status colors

This presentation update applies to the official-results page. It changes no
approval, publication, scoring, correction or permission behavior and needs no
migration or PocketBase restart.

| Display                     | Meaning                                                                |
| --------------------------- | ---------------------------------------------------------------------- |
| Green submitted badge/check | That scorecard is Submitted                                            |
| Green round/card summary    | Every displayed required card is submitted; round also has a course    |
| Blue result panel/badge     | Not approved yet, or approved and awaiting publication                 |
| Blue Approve action         | An Owner/Admin can request approval, subject to existing validation    |
| Green Published — complete  | The current version is the published official version                  |
| Amber Under correction      | A correction is in progress; publication is not complete for that work |

The last published official snapshot retains its green panel while corrections
or a newer approval are pending, with explanatory text. The main result status
does not say complete until its published/current versions match. Historical
published rows are green snapshots, not assertions that pending work is complete.

Status words and check icons accompany colors. No button is clicked or status
changed by this update. Existing Owner/Admin controls and backend validation
remain authoritative. An all-submitted count does not bypass other approval
checks or imply that results are already official.

Verify in development: the existing 12/12 submitted cards are green; after an
explicit approval, the pending result is blue; after an explicit publication,
the published version is green and marked complete. Check that a correction
returns the main status to amber while retaining the prior published snapshot.
Use existing correction workflows only when a real test correction is intended.
