# Workout recaps and share posters

Open a saved workout from Dashboard → Recent workouts or the Workout calendar.
The recap shows completed work, all distinct qualifying observed PRs, the
workout's chronological contribution to capped daily XP and the level reached
through that workout. Opening a recap never awards points again or rewrites
history. Existing detailed sets, feedback, editing, deletion and CSV export remain
available below it. The saved-workout celebration also links to the recap.

PR comparability and XP use the existing rewards policy. Repeated identical set
records collapse to one highlight per exercise/type/load-or-rep anchor; distinct
records remain visible. Baselines are acknowledged without inventing PRs.

## Instagram Story image

Create share poster generates a 1080 × 1920 PNG entirely on the device. It shows
the record count, up to three PR highlights, completed work, duration and derived
progress. Additional PRs are counted and remain visible in the recap. The native
share sheet is invoked only by a user's tap after the file is ready. It does not
publish to Instagram automatically. Unsupported file sharing falls back to PNG
download; cancelling the share sheet is harmless.

Profile name, exact bodyweight, notes, pain and recovery feedback are excluded.
Estimated calories have an explicit inclusion toggle. No image upload, external
image service, reward ledger or new database table is used.

## Rough energy estimate

This is a broad **gross session-energy scenario range**, not measured active
calories, a confidence interval or a personalised metabolic model. It uses 3.5
and 6 MET reference scenarios × bodyweight in kg × duration in hours, rounded to
tens of kcal. These are 2024 Adult Compendium conditioning codes 02054 and 02050.
Adult reference values are not calibrated to the user's age or metabolism.
Rests, pauses and a timer left running can make it inaccurate. There is no
inference from RIR, tonnage, soreness or session feeling, and it does not affect
XP, progression or nutrition targets.

Prefer bodyweight captured with the session. If only current profile bodyweight
exists, label that fallback explicitly rather than pretending it is historical.
Missing weight, no completed work, invalid duration, or duration over four hours
produce no estimate. The model does not silently assume the user's old weight.

Sources: [activity entries](https://pacompendium.com/conditioning-exercise/),
[MET definition](https://pacompendium.com/).

## Music-friendly foreground chime

The rest controls offer a bounded volume slider and a preview. A short sine chime
uses fades and disconnects its audio nodes after playback. Request the optional
`ambient` Audio Session type where supported; unsupported hints and audio errors
never block logging. No microphone access, silent keepalive, beat detection or
interruption of another app's playback is requested. Armed background alerts
continue to use the OS sound without a duplicate foreground chime.

iPhone Silent mode can silence foreground Web Audio. A PWA cannot select a
custom lock-screen notification sound or reproduce native media-volume controls.
Actual music mixing, volume routing and headphone behavior still need an iPhone
check; a browser mock of Audio Session proves the requested policy, not OS behavior.

Sources: [MacroFactor media-volume feature](https://macrofactor.com/wo-version-1-1-3/),
[W3C audio-session types](https://www.w3.org/TR/audio-session/),
[WebKit audio behavior](https://bugs.webkit.org/show_bug.cgi?id=252746),
[web notifications](https://notifications.spec.whatwg.org/).
