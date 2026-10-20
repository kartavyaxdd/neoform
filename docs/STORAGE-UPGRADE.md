# Normalized history storage

The client, Worker and migration 0004 form one release. Deploy them together. The actual published version is the full SHA at `/__release.json`; a successful Git push alone does not prove deployment.

## Storage and compatibility

History lives in owner-scoped workout rows, separate from the bounded state header. Legacy conversion is lazy, preserves revision, ordered IDs and observations, and leaves the original row untouched. After conversion, legacy `/api/data` requests receive HTTP 426 instead of accepting a potentially incomplete old-client snapshot. Reload current assets before continuing; export pending old-tab work first.

The frozen legacy row is a migration source, not a current backup after normalized writes. Do not roll back to a Worker that ignores `storage_heads`: that could fork history. Recover with a compatible release and a verified backup.

History pages pin a revision, and both metadata selection and body reads check it. Saves send explicit upserts, positions and deletions. Final count, ordering, uniqueness and exercise references are checked before an atomic D1 batch updates header, rows and receipt. Each invocation has a fresh attempt token independent of the retryable operation ID. Repeating an acknowledged operation returns its original revision without replaying over subsequent work.

Large transfers stage immutable parts and a content checksum. They remain invisible until final commit. Object-key order does not affect hashes; array order does. Admission is atomically limited to four active uploads per owner. A database trigger limits all pending owner parts to 100 MB and 100,000 mutations, with 24-hour expiry and scoped cancellation. Identical retries remain successful even at the staging boundary. These are software resource budgets, not unlimited storage promises.

## Device state and account isolation

`OfflineVault` stores cache and journal headers separately from ordered workout rows. Ordinary draft edits retain unchanged history references and do not clone or serialize every workout. Copy-on-write edits validate the bounded header and changed history records; complete hydration and conflict merges still validate complete state. Revision-only idle checks stop while the tab is hidden.

Each persisted slot has a unique token. A connection may apply a delta only against the token captured with its in-memory baseline; otherwise it resets the slot atomically. Transactions also preserve receipts and refuse stale journal generations. Native IndexedDB acknowledgement and exact-generation journal cleanup cannot erase a newer draft.

`MutationQueue` preserves immutable cloud plans and parts before transmission. The store first saves the exact sending snapshot, then stages its operation. On acknowledgement it durably stores updated state and journal receipts before removing the queued transaction. Interrupted recovery retries the same operation ID. Account-bound request closures pin both identity and epoch for every request, including multipart parts. Obsolete initializers and responses cannot replace another account's state; late acknowledgements recompute from the newest branch.

Device status says “Saving on device” until the relevant transaction commits. Failures keep the memory copy and show an unsaved warning. Conflict resolution pauses editing and sync until its choice is durable. Legacy localStorage journals are copied without deleting another old tab's mutable journal; immutable receipts suppress consumed generations. Sign-out and account deletion await owner-scoped device cleanup, while sign-out refuses to silently discard other pending tab drafts.

## Backups

Settings exports version 2 JSONL with a bounded header, individually bounded ordered workout records and a final checksum. Import reads bounded UTF-8 lines, validates IDs, references, order, count and checksum, and presents a deliberate merge/replace preview. Truncated or modified files cannot be applied. Version 1 JSON imports remain supported within their original limit. Files contain training data, not credentials, and are unencrypted.

A synthetic history beyond the former 2 MB account limit is restored through the actual UI and D1 transport, exported exactly, and retained through an offline reload. Database and staging quotas still apply. A 100 MB staging budget can constrain very large restores; do not promise every possible database-sized replacement fits without operational planning.

## Verification and release gates

The owned private Worker/D1 suite covers migration, isolation, stale revisions, lost acknowledgements, immutable parts, ordering/deletions, dangling references, upload admission/budgets and a forced statement failure proving full batch rollback. Native browser tests cover device transaction failure, two-connection and overlapping writes, cross-account preparation/initialization races, late acknowledgements, accurate save status, logout cleanup, offline recovery and large-backup UI restore. The compact 360/390px logger, readiness, equipment, phase and accessibility gates remain required.

`npm run test:public` uses a separate owned Worker/D1 database with the actual public-workspace flag, verifies its authentication/AI boundaries and runs real public logging/reload. Both private and public suites run in Ubuntu deployment CI before remote writes. Hosted verification intercepts every data endpoint with synthetic records; it must never read or modify the real public training workspace.

Three independent client/server/product reviews identified and closed account races, stale deltas, durability messaging, cleanup, legacy aggregate limits and resource-budget races. Approval remains conditional on passing final gates and actual GitHub/public release verification. Generated evidence, private state and credentials never belong in Git.

The broader response-learning, scheduling, coaching-transaction, program-quality and review work in `IMPROVEMENT-PLAN.md` remains open. This release does not establish measured hypertrophy, optimal personal volume or a lifetime free-hosting guarantee.
