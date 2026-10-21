# Workouts visual reference

The screen reference is MacroFactor's official [Workouts quick-start guide](https://macrofactor.com/welcome-to-macrofactor-workouts/) and its [PDF](https://macrofactor.com/wp-content/uploads/2026/01/Workouts-Quick-Start-Guide.pdf). The [Dashboard help page](https://help.macrofactorapp.com/en/articles/275-getting-to-know-your-workouts-dashboard) and [Feature Settings overview](https://help.macrofactorapp.com/en/articles/352-feature-setting-overview) establish the screen hierarchy. Reference screenshots were inspected, not inferred from article prose.

| Screen | Presentation implemented in NEOFORM |
| --- | --- |
| Shared shell | Neutral surfaces, black primary actions, five bottom destinations, restrained blue for training context, compact sheets and dividers. |
| Workout | Centered title, outlined weekly date capsules, expandable active program, exercise-name previews and primary-muscle chips, library and grouped history/archive actions. |
| Logger | Duration/rest header, horizontal exercise tiles, one exercise, pill toolbar, grey numeric inputs and compact square completion controls with 44px hit targets. |
| Dashboard | Date and uppercase title, three circular weekly totals, small analytics panels, recent workouts and exercise progress. |
| Levels | Shared front/back primary-muscle schematic, selectable muscle rows and separate advanced/indirect details. |
| More | Profile row, grouped feature controls, chevrons, settings expanded only on demand. |
| Saved workout | Muscle overview first, horizontally scrolling observed-record cards, workout details and expandable exercise/set breakdown, fixed Done footer. Sharing has a separate preview. |

This reproduces the referenced hierarchy and component treatment, not MacroFactor's proprietary source, training engine, branded font, exercise photography or exact anatomy artwork. NEOFORM's own schematic, branding and existing features remain. Desktop uses the same destinations in the existing centered app shell. Dark mode and reduced motion remain supported.

## Meaning of displayed numbers

Weekly circles report completed primary muscles, working sets and exercises; they do not invent set targets or imply measured hypertrophy. Training-day goals still come from the profile. PRs and XP retain the existing comparability and daily caps; no estimated-strength record substitutes for an observed record. RIR stays visible on the approved 0–10 colour scale, and missing effort stays unknown. Assigned targets, routine order and actual observations retain their existing persistence interfaces.

## Verification scope

Browser gates cover 360px, 390px and desktop, light/dark, keyboard logging, sheet focus return, drag/swipe/undo, explicit coaching acceptance, device saving, offline resume and backups against isolated Worker/D1/Durable Object fixtures. Hosted verification intercepts every workout storage request with synthetic data, so release tests do not read or mutate the personal public workspace. Physical iPhone audio mixing and native image sharing require device checks; browser mocks do not establish OS behaviour.
