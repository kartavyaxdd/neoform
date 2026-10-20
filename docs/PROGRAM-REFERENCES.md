# Manual program load references and exercise categories

Targets may carry an optional `startingLoad` (0–2000): canonical kg for standardized loads or the original raw number for machine labels. It is an editable manual first-session reference, not a measured effort observation or an automatic progression recommendation. Compatible logged working-set loads take precedence. Changing the exercise clears the reference; an explicit equipment setup cannot inherit a reference lacking that setup identity. No historical prescriptions are inferred or rewritten.

Forearms and Neck are distinct optional custom-exercise categories. They are available to manual logging, filters and reported observations. The AI generator continues to use the existing major-muscle catalog and emphasis options; adding categories does not pretend those movements are supported by its bounded exercise catalog. Custom library additions use original names/instructions and are not a copy of a third-party proprietary exercise database.

Existing accounts, completed sessions, settings and programs are unchanged by deployment. A personal program and additional exercise definitions are saved through an explicit data merge, with a pre-merge backup, separately from the code release. Confirm the published full SHA at `/__release.json` and verify the actual saved plan and compact logger after merging.
