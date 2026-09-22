# Spendly P0 data integrity

The app remains Vanilla HTML/CSS/JavaScript and uses `spendly:data`.
No goal-management, analytics, modal UX, or other P1/P2/P3 features were added.

## Storage and recovery

Saves now carry `schemaVersion: 1`. Before upgrading an unversioned save or
repairing IDs/counters, the exact original string is copied to a unique
`spendly:data:backup:<timestamp>[:suffix]` key. Existing backups are never
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
saving are deferred until the complete candidate passes validation. Failure
restores state, ID counter, and queued-modal context. BigInt is used internally
for exact aggregate checks; persisted amounts remain JSON numbers. Aggregate
income, expenses, savings, and balance plus savings must fit the safe integer
range. Existing nonnegative-balance and savings-overfunding policies are unchanged.

## Save failure handling (P1.2)

saveState() returns true only after localStorage.setItem succeeds. It returns
false for write failures, recovery-blocked saves, and deferred saves during an
action. Invalid state still throws before writing, preserving action rollback.
render() forwards that result to the action wrapper. Success toasts are emitted
only after a successful save; a failure also clears any previous success toast.

A failed write retains the valid in-memory changes and leaves the previously
stored data intact. The persistent notice warns users to keep the page open,
because refreshing or closing can lose changes that have not been saved. Retry
save writes the current state without replaying transactions or transfers. The
notice clears only after persistence succeeds. A subsequent valid action also
attempts to save the entire current state.

runStateAction's boolean remains a modal-closure decision, not a save result.
An applied action closes its modal even if saving fails, preventing accidental
duplicate submissions. Validation failures still roll back and keep the modal
open. Reset failures retain the requested reset in memory, but leave the prior
stored state intact until retry succeeds. Migration backups and recovery write
blocks continue to apply.

Cross-tab synchronization remains deferred P1.3 work. No libraries were added.
BigInt requires a modern browser.

## Verification

Run with Node.js:

    node --check script.js
    node --test tests/data-integrity.test.cjs

The tests execute the actual script using isolated simulated DOM/storage objects.
They cover recovery, migration, validation, ID repair, accounting, rollback, CRUD,
savings, and persistence across fresh script instances. They do not manipulate
personal browser data or substitute for real browser layout/interaction testing.
