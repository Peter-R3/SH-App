# App management

Peter's profile opens App Management, with Controls and Activity Log tabs.
The existing two-account Firebase allowlist remains unchanged. The Peter-only
visibility is a UI restriction, not an additional database authorization boundary.

## Achievement repairs

Choose a profile, game, achievement track and tier, then review a change before
confirming it. A concurrent change to that track requires a fresh review.

- Set progress uses an offset without rewriting underlying game statistics.
  Future gameplay continues to add progress normally.
- Grant tier unlocks the selected tier independently of its progress.
- Revoke tier keeps the selected tier locked even if its target is met.
- Restore automatic tracking removes the selected tier's override and the
  progress offset (shared across a regular track, separate for star tiers).
  Existing unlocks remain unless explicitly revoked.

Repairs are silent: newly unlocked tiers are marked seen, and no coins are
awarded. Currency and store ownership controls are deferred until those systems
exist. Changes live under each profile's existing `achievements` record.

## Diagnostic activity

Both profiles record selected connection changes, game navigation, 1 to 10 turn
submissions, history saves, achievement synchronization, management operations
and runtime failures. This is targeted instrumentation, not a record of every
database write or user action.

The shared `diagnostics/events` collection retains at most 500 entries. Entries
older than seven days are removed on the next log write, not by a server timer.
A local buffer retains at most 100 pending entries for up to seven days and
retries after reconnecting, on new activity, or every minute while connected.
Stable entry IDs prevent duplicate records on retry.

Only allowlisted structural fields are stored: event identifiers, profile names,
outcomes, counts, numeric before/after values, approved error codes and source
filenames/line numbers. Message text, email addresses, credentials, Realm codes,
notes, photos, raw exception messages and stack traces are excluded.

The log supports profile/event filters, failures-only filtering, expandable
details, retry and JSON export of the currently filtered entries. Exported logs
still contain profile names and timestamps; review them before sharing publicly.

## Verification

`tests/diagnostics.test.cjs` covers repair semantics, privacy filtering, retention
and offline retry. `tests/management-ui.test.cjs` exercises the controls with a
mock Firebase database, confirmations, conflict handling, narrow layouts, log
export and the Peter-only UI gate. No live account records are used by these tests.
