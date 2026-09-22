# Spendly persistence and data integrity

The app remains Vanilla HTML/CSS/JavaScript and uses `spendly:data`.
This document covers P0 integrity safeguards and P1 persistence handling.

## Storage and recovery

Saves now carry `schemaVersion: 1`. Before upgrading an unversioned save or
repairing IDs/counters, the exact original string is copied to a unique
`spendly:data:backup:<timestamp>:<uuid>[:suffix]` key. Existing backups are never
replaced. Backup verification must succeed before migration can be committed.

Invalid JSON, unsupported versions, malformed records, unsafe totals, or a
versioned accounting mismatch block loading and subsequent mutations. The
original main key is retained, rather than filtering out records and saving
partial data. A persistent notice explains the blocked state. If possible,
the original is also backed up. Storage read/backup failures block recovery
writes too.

Recovery is deliberately manual: retain/export the raw main key and backup,
correct the malformed data in a separate copy, restore a valid save, then
reload. Do not replace a save with the empty state shown during blocked
recovery. The existing confirmed Reset data action can start fresh only after
a backup is secured. Reset leaves recovery backups intact.

## Legacy accounting

No historical transactions or dates are invented. Migration retains:

- `legacyIncome`: the positive difference between the old aggregate income and
  the sum of recorded income transactions. It contributes to all-time Money in,
  but never to monthly income or the income transaction count.
- `openingBalanceAdjustment`: the unexplained signed difference required to
  preserve the old available balance after accounting for recorded income,
  legacy income, expenses, and goal savings. This is unresolved legacy metadata,
  not a claim that a historical transaction actually occurred.
- `historyIncomplete`: explicitly flags missing or inconsistent historical
  information. The page explains that monthly totals cover recorded history.

If an old total is smaller than recorded income, recorded transactions take
precedence for the displayed total; the original aggregate remains in the
backup and the history is flagged incomplete. Migration cannot reconstruct
missing history or recover data already overwritten by an earlier app version.

The checked accounting equation is:

    balance + sum(goal.saved)
      = sum(income.amount) + legacyIncome - sum(expenses.amount)
        + openingBalanceAdjustment

Complete history requires both legacy amounts to be zero. Versioned balance
mismatches are blocked rather than converted to new adjustments. Later actions
preserve the migrated adjustment unchanged.

## Validation and actions

Amounts are positive whole-rupiah safe integers; balance, saved money, and the
unset daily limit may be zero. Input accepts digits or properly grouped Rupiah
text. Negative numbers, decimal/mixed text, infinity, and unsafe integers are
rejected rather than stripped into another amount. Single-key editing keeps
existing currency formatting usable; invalid pasted text stays visible.

Record names must contain non-whitespace text, categories must be recognized,
dates must be real calendar dates (plain dates and legacy ISO timestamps are
supported), and optional expense reasons must be strings. IDs must be positive
safe integers. Duplicate IDs are reassigned without dropping records; the
counter is recovered from existing IDs and a valid stored counter. An exhausted
counter searches for unused IDs instead of overflowing.

UI submit/cancel mutation handlers pass through `runStateAction`. Rendering and
saving are deferred until the complete candidate passes validation. Validation failure
restores state, ID counter, and queued-modal context. BigInt is used internally
for exact aggregate checks; persisted amounts remain JSON numbers. Aggregate
income, expenses, savings, and balance plus savings must fit the safe integer
range. Existing nonnegative-balance and savings-overfunding policies are unchanged.

## Save failure handling (P1.2)

saveState() is asynchronous and resolves true only after localStorage.setItem
succeeds. It resolves false for write failures, stale/conflicted saves, recovery
blocks, or a save already in progress. Invalid state rejects before writing,
preserving action rollback. render() now only redraws the page; the action wrapper
awaits saveState() separately so external refreshes never write back. Success toasts are emitted
only after a successful save; a failure also clears any previous success toast.

A failed write retains the valid in-memory changes and leaves the previously
stored data intact. The persistent notice warns users to keep the page open,
because refreshing or closing can lose changes that have not been saved. Retry
save writes the current state without replaying transactions or transfers. The
notice clears only after persistence succeeds. A subsequent valid action also
attempts to save the entire current state.

runStateAction resolves a modal-closure decision, not a save result.
An applied action closes its modal even if saving fails, preventing accidental
duplicate submissions. Validation failures still roll back and keep the modal
open. Reset failures retain the requested reset in memory, but leave the prior
stored state intact until retry succeeds. Migration backups and recovery write
blocks continue to apply.

## Multi-tab synchronization (P1.3)

Each save carries a nonnegative safe-integer revision alongside schemaVersion.
Saves without a revision are backed up and upgraded from revision zero. A
successful write increments the revision; failed writes do not. Resetting data
through the app also increments the revision. Exhaustion fails closed rather
than wrapping. Existing revisioned data is not rewritten merely by opening a tab.

All writers use the origin-wide Web Lock named spendly:state-write. Inside the
exclusive lock, saveState compares the current raw stored string against the
exact source this tab loaded or last saved, then writes the next revision. The
comparison protects against a delayed/missed storage event, malformed replacements,
and external writers reusing a revision. The lock closes the read/check/write race
between tabs running this version. Actions and retry wait for this asynchronous
result; duplicate actions are blocked while a write is pending.

The storage event listener reacts to spendly:data and storage.clear(), ignoring
backup keys, unrelated keys, and other storage areas. It reads the latest actual
value rather than trusting an old event payload. A clean tab validates and adopts
external data and redraws without saving, preventing write loops or duplicates.
Corrupt incoming data leaves the current state intact and uses the existing
recovery/backup protections. Older or reused revisions require explicit resolution.

A tab is considered to have local work if it has an open modal, a pending action,
a failed save, or state/IDs that differ from its last clean snapshot. Open modals
are treated conservatively even before a user edits them. External updates then
show a conflict notice, preserve both draft fields and in-memory financial state,
and block saves/retries/new mutations. The user can keep the page open to review
local work, or cancel the dialog and click Discard local changes and load latest.
That explicit action validates the latest stored data before replacing local data;
it does not write, replay transactions, or automatically merge anything. Invalid
incoming data cannot cause discard. Refreshing/closing can still lose local work.

Use all tabs on the same origin with the current app version. Older app versions,
browser developer tools, and other writers that bypass the Web Lock cannot be
forced to participate. Reload old tabs after upgrading. Different origins or
browser profiles do not share this storage. Deleting browser storage externally
removes its persisted revision history too.

Safe writes require Web Locks (a modern browser on HTTPS or localhost). If that
API is unavailable, saving fails visibly instead of using an unsafe unlocked
fallback. No libraries were added. P2/P3 features and the roadmap are unchanged.

## Verification

Run with Node.js:

    node --check script.js
    node --test tests/data-integrity.test.cjs

The tests execute the actual script using isolated simulated DOM/storage objects.
They cover recovery, migration, validation, ID repair, accounting, rollback, CRUD,
savings, persistence across fresh script instances, and shared-storage tabs with
a serialized lock test double. The original tests now await asynchronous saves. They do not manipulate
personal browser data or substitute for real browser layout/interaction testing.
