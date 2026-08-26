# Two tabs stop overwriting each other

Date: 2026-08-25
Status: approved

## Summary

`StudyPlanner` listens for the `storage` event. When another tab writes the week
currently on screen, a clean tab reloads it silently; a tab with unsaved edits
keeps them and shows a small bar offering **Reload** or **Keep mine**.

Nothing is discarded without the user saying so. Where a conflict is genuinely
unresolvable, the existing last-writer-wins behaviour stays — the change is that
it stops being silent.

## Motivation

Nothing listens for the `storage` event, and every edit serialises and writes
the whole week from in-memory state. A second tab holding a stale copy therefore
reverts the first tab's work on its next keystroke. Last writer wins, silently,
and the user is never told.

The trigger in practice is **a forgotten or restored tab** — one left open on
another window or desktop, or one the browser reopened on startup — not
deliberate concurrent editing. That shapes the design: a forgotten tab is
usually clean, and reloading a clean tab costs nothing at all.

## The failure is narrower than "two tabs open"

`flushPendingSave` calls `saveWeek(pending.date, pending.data)`, which writes
only `planner-${getWeekKey(date)}` — one key, never the whole store. So:

- Two tabs on **different weeks** cannot corrupt each other's week data.
- Two tabs on the **same week** are the entire data-loss case.
- The settings — `planner-theme`, `planner-color-scheme`,
  `planner-show-weekends`, `planner-color-labels` — are single values where last
  write wins harmlessly.

The fix is therefore scoped to one key: the week on screen.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Detection | `storage` event | The only cross-tab signal localStorage offers |
| Where the listener lives | `storage.ts` exposes `onExternalChange` | `StorageEvent.key` is a storage concept; that module owns them |
| Clean tab | Reload silently | Nothing to lose, and a forgotten tab is usually clean |
| Dirty tab | Keep edits, show a notice | Discarding typing without asking trades one silent loss for another |
| Reload mechanism | Bump the existing `refreshKey` | Already built and tested for the import path |
| While a conflict is open | Keep saving | Holding the write would lose the edits entirely if the tab closed |
| Scope | Week keys only | Settings are cosmetic single values |

Rejected alternatives:

- **Always reload on any external change.** Ten lines and no UI, but it
  silently discards whatever was typed in the forgotten tab — trading one kind
  of silent data loss for a smaller one. This app's rule is that a stored week
  is the user's only copy; that rule does not stop applying because the copy is
  inconvenient.
- **Reload when clean, stay silent when dirty.** Half the fix, no UI, and it
  leaves the original bug alive in the case where it costs most: the dirty tab
  still overwrites the other tab's work on its next keystroke, and still says
  nothing.
- **Merge per field.** Rejected: there is no basis for choosing between two
  values of the same field, and the codebase has already rejected fuzzy matching
  elsewhere for the same reason — it is worse than the problem when it is wrong.
- **Single-tab ownership, second tab read-only.** Eliminates the class outright,
  but a forgotten tab would silently refuse to accept typing, which is a worse
  surprise than the one being fixed.
- **Hold writes while a conflict is open.** Rejected: the user's typing would
  live only in memory, and closing the tab would lose it with no trace at all.

## Detection

`src/lib/storage.ts` gains:

```ts
export function onExternalChange(handler: (key: string | null) => void): () => void
```

It subscribes to the window's `storage` event, passes `event.key` to the
handler, and returns an unsubscribe.

Two properties of the event shape the code:

- **It fires only in *other* documents of the same origin**, never in the tab
  that wrote. No self-echo guard is needed, and no test can produce it by
  writing to `localStorage` in the same document.
- **`event.key` is `null`** when another tab calls `localStorage.clear()`. That
  means "everything changed" and must count as relevant, not be skipped as
  unrecognised.

The subscription belongs here rather than in the component because
`src/lib/storage.ts` is the only module that owns storage concepts, and
`StorageEvent.key` is one. The listener itself does not touch `localStorage`, so
the existing rule is unaffected either way — but keeping it here means a future
reader looking for "how does this app learn about storage" finds one file.

## Response

`StudyPlanner` subscribes while mounted and ignores any key that is neither
`null` nor the week on screen — `planner-${getWeekKey(currentDate)}`.

For a relevant change:

- **`dirtyRef.current === false`** — bump `refreshKey`. That is the existing
  reload path: the load effect flushes any pending write (a no-op when clean),
  re-reads the week through `loadWeek`, and clears `dirtyRef`. It also recomputes
  the carry-forward candidates, which matters because if the other tab edited
  *last* week, this tab's candidate list is stale too.
- **`dirtyRef.current === true`** — set a conflict flag. Do not reload, and do
  not interfere with saving.

Reusing `refreshKey` rather than adding a second reload path is deliberate: it
is already exercised by the import tests, and a parallel mechanism would be a
second place for the flush-before-load ordering to be got wrong.

## The notice

A small bar, same shape as `CarryForwardBar`:

- Carries `no-print`.
- Carries **none** of `role="menu"`, `role="dialog"` or `role="listbox"`.
  `TimeGrid`'s keydown guard tests `closest?.()` for exactly those so Radix
  menus can swallow digits; any of them on an ancestor silently disables the 1–9
  paint shortcuts whenever focus sits inside.
- Renders **below both week chevrons**. `autosave.test.tsx` and
  `pending-save.test.tsx` reach the next week with
  `container.querySelectorAll("button")[1]`; a control inserted before either
  chevron repoints those at the wrong button, and they then fail looking like a
  save bug rather than a layout change.

Text: "This week was changed in another tab." Two actions:

- **Reload** — drop the pending write, then bump `refreshKey` and clear the
  flag. Discards the local edits, which the user has just chosen to do.
- **Keep mine** — clear the flag. The next debounced write lands as it does
  today, and wins.

The flag also clears when the viewed week changes, since it describes a
conflict on one particular week.

**Reload must drop the pending write before bumping `refreshKey`, or it does
the opposite of what it says.** The load effect calls `flushPendingSave()`
*first* — so a bare bump would write the local stale copy over the other tab's
work, then read back its own write. The order is:

```ts
pendingRef.current = null;
dirtyRef.current = false;
setRefreshKey((k) => k + 1);
```

This is race-free rather than merely lucky: `flushPendingSave` returns early
when `pendingRef.current` is null, so a 300ms timer that fires in the gap
becomes a no-op. And with `dirtyRef` already false, the save effect returns
early when the reloaded `weekData` lands, so no new timer is scheduled.

The clean path needs none of this — `pendingRef` is only ever set while dirty,
and `flushPendingSave` nulls it after writing.

## "Dirty" means edited, not unsaved

`dirtyRef` records that the user has changed this week *since it was loaded*.
It is not cleared when a write lands — only by the load effect. So a tab can be
dirty with nothing pending: it typed, the debounce fired, the write succeeded.

That is the right trigger for the notice anyway, and for a reason worth stating.
Such a tab has edits in this week that the other tab may have just overwritten;
telling the user is correct even though nothing local is unsaved. The wording is
therefore "This week was changed in another tab", not "you have unsaved
changes" — the second would be false in exactly this case.

## Why saving continues while a conflict is open

Holding the write would mean the user's typing lives only in component state,
and closing the tab would lose it with no trace — no stored copy, no unreadable
backup, nothing. `A stored week is the user's only copy` is the rule the rest of
this app is built on, and it argues for writing, not withholding.

So the behaviour under an unresolved conflict is exactly what it is today. The
change is that the user can see it and act on it, rather than discovering it
later as missing work.

## Changes

### 1. `src/lib/storage.ts`
Add `onExternalChange`.

### 2. `src/components/planner/CrossTabNotice.tsx` (new)
Presentational. Receives `onReload` and `onKeepMine`, renders the bar.

### 3. `src/components/planner/StudyPlanner.tsx`
Subscribe while mounted, keyed on `currentDate` so the handler always tests the
week on screen. Add the conflict flag, clear it on week change, render the
notice below the chevrons.

## Testing

`jsdom` does not fire `storage` events for its own `localStorage` writes, so
tests dispatch a synthetic `StorageEvent`. That is not a workaround: the real
event never fires in the writing document either, so a synthetic event is the
only way to exercise this in any environment.

- A clean tab reloads the week when its key changes externally.
- A dirty tab does **not** reload; the notice appears and the local edits are
  still on screen.
- A different week's key changes nothing.
- A settings key changes nothing.
- `key: null` counts as relevant.
- **Reload** re-reads from storage and dismisses.
- **Keep mine** dismisses, and the next debounced write still lands.
- The subscription is removed on unmount.
- The notice carries `no-print` and none of the three guarded roles.
- `autosave.test.tsx`, `pending-save.test.tsx` and `today.test.tsx` still pass —
  their button indices are unchanged.

## Out of scope

- Settings keys. Last write wins, and the effect is cosmetic.
- Merging two versions of a week.
- Any lock or ownership scheme.
- `BroadcastChannel`. The `storage` event is sufficient here and needs no
  fallback; adding a second channel would mean two paths to keep in step.

## Risks

- **The notice can be ignored.** A user who dismisses nothing and keeps typing
  still overwrites the other tab. That is the accepted residue: the alternative
  is withholding their writes, which loses more.
- **`refreshKey` now has two callers.** Import and cross-tab reload. Both want
  exactly the same thing, but a future change to one must consider the other.
- **The listener re-subscribes per week.** `currentDate` is in the effect deps.
  That is cheap and rare, but it means the handler closure is recreated on every
  week change; it must not capture stale state beyond `currentDate` itself.
