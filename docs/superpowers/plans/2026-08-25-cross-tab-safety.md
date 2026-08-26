# Two tabs stop overwriting each other — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When another tab writes the week on screen, a clean tab reloads it silently and a tab that has edited it keeps its work and says so — instead of overwriting the other tab without a word.

**Architecture:** `storage.ts` gains one subscription helper. `StudyPlanner` uses `dirtyRef` to pick between reloading and warning, and reuses the existing `refreshKey` reload path rather than building a second one. A small presentational notice offers Reload / Keep mine.

**Tech Stack:** React 18, TypeScript (`strict` off), Vite, Tailwind, Vitest with jsdom.

Spec: `docs/superpowers/specs/2026-08-25-cross-tab-safety-design.md`

---

## The two things most likely to be got wrong

**1. Bumping `refreshKey` is not, by itself, a reload.** The load effect calls
`flushPendingSave()` *first*. In the dirty case a bare bump therefore writes
this tab's stale copy over the other tab's work and then reads back its own
write — the Reload button doing the exact opposite of its label. The pending
write must be dropped first.

**2. `dirtyRef` means "edited since loaded", not "unsaved".** It is set on edit
and cleared only by the load effect, never by a successful write. So a tab can
be dirty with nothing pending: it typed, the debounce fired, the write landed.
That tab is precisely the one whose work the other tab may have just
overwritten, so it should still be told — but the notice must not claim there
are unsaved changes, because there may not be.

## Why the failure is narrower than "two tabs open"

`saveWeek` writes `planner-${getWeekKey(date)}` — one key, never the whole
store. Two tabs on *different* weeks cannot corrupt each other's week data. The
settings (`planner-theme`, `planner-color-scheme`, `planner-show-weekends`,
`planner-color-labels`) are single values where last write wins harmlessly. The
whole fix is scoped to one key: the week on screen.

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/storage.ts` | Subscribe to cross-tab storage changes | Modify |
| `src/components/planner/CrossTabNotice.tsx` | The Reload / Keep mine bar | Create |
| `src/components/planner/StudyPlanner.tsx` | Decide reload vs warn; render the notice | Modify |
| `src/test/cross-tab.test.tsx` | All of it | Create |

---

## Task 1: Learn when another tab writes

**Files:**
- Modify: `src/lib/storage.ts`
- Test: `src/test/cross-tab.test.tsx` (create)

- [ ] **Step 1: Write the failing tests**

Create `src/test/cross-tab.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { onExternalChange } from "@/lib/storage";

/**
 * jsdom does not fire storage events for its own localStorage writes, so these
 * dispatch a synthetic one. That is not a workaround: the real event never
 * fires in the writing document either, so a synthetic event is the only way
 * to exercise this in any environment.
 */
const externalChange = (key: string | null) =>
  window.dispatchEvent(new StorageEvent("storage", { key }));

describe("onExternalChange", () => {
  it("reports the key another tab changed", () => {
    const seen: (string | null)[] = [];
    const off = onExternalChange((k) => seen.push(k));
    externalChange("planner-2026-W35");
    off();
    expect(seen).toEqual(["planner-2026-W35"]);
  });

  it("passes null through rather than filtering it", () => {
    // null means another tab called clear(). Only the caller knows whether
    // that matters, so this must not swallow it.
    const seen: (string | null)[] = [];
    const off = onExternalChange((k) => seen.push(k));
    externalChange(null);
    off();
    expect(seen).toEqual([null]);
  });

  it("stops reporting once unsubscribed", () => {
    const handler = vi.fn();
    const off = onExternalChange(handler);
    off();
    externalChange("planner-2026-W35");
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns a callable unsubscribe even with no window", () => {
    // Guarding the subscribe means the unsubscribe must stay callable, or the
    // caller's effect cleanup throws.
    expect(typeof onExternalChange(vi.fn())).toBe("function");
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/test/cross-tab.test.tsx`
Expected: FAIL — `onExternalChange` is not exported.

If `new StorageEvent(...)` throws in this jsdom build, fall back to
`Object.assign(new Event("storage"), { key })` and say so in your report — do
not silently change the test's meaning.

- [ ] **Step 3: Add the helper**

In `src/lib/storage.ts`, append:

```ts
/**
 * Learn when another tab changes storage.
 *
 * The `storage` event fires only in OTHER documents of the same origin — never
 * in the tab that wrote — so there is no self-echo to guard against, and no
 * test can produce it by writing to localStorage in the same document.
 *
 * `event.key` is null when another tab calls clear(), meaning "everything
 * changed". It is passed through rather than filtered here: only the caller
 * knows which keys it cares about.
 *
 * Returns an unsubscribe, which stays callable even where there is no window,
 * so an effect cleanup never throws.
 */
export function onExternalChange(handler: (key: string | null) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const listener = (event: StorageEvent) => handler(event.key);
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}
```

- [ ] **Step 4: Run and verify**

Run: `npx vitest run src/test/cross-tab.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Full verification**

- `npm test` — baseline **277 tests across 25 files**; expect **281 across 26**.
- `npm run lint` — 0 errors, exactly 10 warnings.
- `npx tsc --noEmit` — clean.

- [ ] **Step 6: Commit**

Commit `src/lib/storage.ts` and `src/test/cross-tab.test.tsx`.

**Mutation self-review.** Apply each, confirm a test fails, restore, leave `src/` clean:

1. `handler(event.key)` → `handler(event.newValue)`
2. Return `() => {}` instead of the real unsubscribe
3. `if (event.key === null) return;` added before the handler call

Report each as KILLED (naming the test) or SURVIVED. Report survivors honestly rather than patching them; propose a killer test if you see one.

---

## Task 2: The notice

**Files:**
- Create: `src/components/planner/CrossTabNotice.tsx`
- Test: `src/test/cross-tab.test.tsx` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `src/test/cross-tab.test.tsx`, merging the new names into the existing import lines rather than adding second `import ... from "vitest"` statements:

```tsx
// merged into the existing imports:
//   import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
//   import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import CrossTabNotice from "@/components/planner/CrossTabNotice";

describe("CrossTabNotice", () => {
  const setup = (props = {}) =>
    render(<CrossTabNotice onReload={vi.fn()} onKeepMine={vi.fn()} {...props} />);

  it("says which tab changed, not that anything is unsaved", () => {
    // dirtyRef means edited-since-loaded, so this can appear when everything
    // local has already been written. "You have unsaved changes" would be
    // false in exactly that case.
    setup();
    expect(screen.getByText(/changed in another tab/i)).toBeInTheDocument();
    expect(screen.queryByText(/unsaved/i)).toBeNull();
  });

  it("offers reload", () => {
    const onReload = vi.fn();
    const onKeepMine = vi.fn();
    setup({ onReload, onKeepMine });
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(onKeepMine).not.toHaveBeenCalled();
  });

  it("offers keeping this tab's version", () => {
    const onReload = vi.fn();
    const onKeepMine = vi.fn();
    setup({ onReload, onKeepMine });
    fireEvent.click(screen.getByRole("button", { name: /keep mine/i }));
    expect(onKeepMine).toHaveBeenCalledTimes(1);
    expect(onReload).not.toHaveBeenCalled();
  });

  it("does not print", () => {
    const { container } = setup();
    expect(container.firstElementChild?.className.split(/\s+/)).toContain("no-print");
  });

  it("carries none of the roles that would swallow the paint shortcuts", () => {
    // TimeGrid's keydown guard tests closest() for exactly these so Radix menus
    // can swallow digits; any of them on an ancestor disables 1-9 while focus
    // sits inside.
    const { container } = setup();
    expect(container.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/test/cross-tab.test.tsx`
Expected: FAIL — the component does not resolve.

- [ ] **Step 3: Write the component**

Create `src/components/planner/CrossTabNotice.tsx`:

```tsx
import React from "react";
import { RefreshCw } from "lucide-react";

interface CrossTabNoticeProps {
  onReload: () => void;
  onKeepMine: () => void;
}

/**
 * Shown when another tab wrote the week on screen while this tab had edited it.
 *
 * The wording is about the other tab, not about unsaved changes. dirtyRef means
 * "edited since loaded" and is never cleared by a successful write, so this bar
 * can appear when everything local is already stored — and that tab is exactly
 * the one whose work the other tab may have just overwritten.
 *
 * Purely presentational. The decision about what Reload actually does, and the
 * ordering it depends on, lives in StudyPlanner.
 */
const CrossTabNotice: React.FC<CrossTabNoticeProps> = ({ onReload, onKeepMine }) => (
  <div className="no-print flex items-center gap-2 border-b border-border bg-destructive/15 px-3 py-1.5 shrink-0">
    <RefreshCw className="h-3 w-3 shrink-0 text-muted-foreground" />
    <span className="text-[10px] text-foreground">This week was changed in another tab.</span>
    <span className="ml-auto flex gap-2">
      <button
        onClick={onReload}
        className="text-[10px] px-2 py-0.5 rounded bg-campus-blue-dark text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Reload
      </button>
      <button
        onClick={onKeepMine}
        className="text-[10px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        Keep mine
      </button>
    </span>
  </div>
);

export default CrossTabNotice;
```

- [ ] **Step 4: Run and verify**

Run: `npx vitest run src/test/cross-tab.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 5: Full verification**

`npm test` — expect **286 across 26**. `npm run lint` — 0 errors, exactly 10 warnings. `npx tsc --noEmit` clean.

- [ ] **Step 6: Commit**

**Mutation self-review.** Apply each, confirm a test fails, restore:

1. Swap the two `onClick` handlers
2. Remove `no-print`
3. Change the text to "You have unsaved changes"

Report each as KILLED or SURVIVED, honestly.

---

## Task 3: Decide reload or warn

**Files:**
- Modify: `src/components/planner/StudyPlanner.tsx`
- Test: `src/test/cross-tab.test.tsx` (extend)

This is the task where the two traps at the top of this plan live. Read them again before starting.

- [ ] **Step 1: Write the failing tests**

Append to `src/test/cross-tab.test.tsx`. It needs `beforeEach`, `afterEach`, `cleanup` and `act`; merge them into the existing imports.

```tsx
import { saveWeek, loadWeek, createEmptyWeek, getWeekKey } from "@/lib/planner-data";
import { startOfWeek, addWeeks } from "date-fns";
import StudyPlanner from "@/components/planner/StudyPlanner";

const NOW = new Date(2026, 7, 26); // Wed 26 Aug 2026
const thisMonday = () => startOfWeek(NOW, { weekStartsOn: 1 });
const thisKey = () => `planner-${getWeekKey(thisMonday())}`;

/** Let the debounce elapse, matching autosave.test.tsx. */
const settle = async () => { await act(async () => { vi.advanceTimersByTime(400); }); };

const goalInput = () => screen.getByPlaceholderText("What do you want to achieve this week?");

/** What another tab would have written. */
function writeFromOtherTab(text: string) {
  const w = createEmptyWeek(thisMonday());
  w.weekGoal = text;
  saveWeek(thisMonday(), w);
}

describe("StudyPlanner across tabs", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("reloads a clean tab when another tab writes this week", async () => {
    render(<StudyPlanner />);
    writeFromOtherTab("From the other tab");
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: thisKey() })); });
    expect(goalInput()).toHaveValue("From the other tab");
  });

  it("does not reload a tab that has edited this week", async () => {
    render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Mine" } });
    writeFromOtherTab("Theirs");
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: thisKey() })); });
    expect(goalInput()).toHaveValue("Mine");
    expect(screen.getByText(/changed in another tab/i)).toBeInTheDocument();
  });

  it("ignores a change to a different week", async () => {
    render(<StudyPlanner />);
    writeFromOtherTab("Should not appear");
    const otherKey = `planner-${getWeekKey(addWeeks(thisMonday(), 1))}`;
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: otherKey })); });
    expect(goalInput()).toHaveValue("");
  });

  it("ignores a change to a setting", async () => {
    render(<StudyPlanner />);
    writeFromOtherTab("Should not appear");
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: "planner-theme" })); });
    expect(goalInput()).toHaveValue("");
  });

  it("treats a cleared store as relevant", async () => {
    render(<StudyPlanner />);
    writeFromOtherTab("From the other tab");
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: null })); });
    expect(goalInput()).toHaveValue("From the other tab");
  });

  it("shows no notice on a clean tab", async () => {
    render(<StudyPlanner />);
    writeFromOtherTab("From the other tab");
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: thisKey() })); });
    expect(screen.queryByText(/changed in another tab/i)).toBeNull();
  });

  it("reload takes the other tab's version and dismisses", async () => {
    render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Mine" } });
    writeFromOtherTab("Theirs");
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: thisKey() })); });
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    await settle();
    expect(goalInput()).toHaveValue("Theirs");
    expect(screen.queryByText(/changed in another tab/i)).toBeNull();
  });

  it("reload does not write this tab's stale copy on the way out", async () => {
    // THE point of the task. The load effect flushes pendingRef first, so a
    // bare refreshKey bump would write "Mine" over "Theirs" and then read back
    // its own write — Reload doing the opposite of its label.
    render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Mine" } });
    writeFromOtherTab("Theirs");
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: thisKey() })); });
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    await settle();
    expect(loadWeek(thisMonday()).weekGoal).toBe("Theirs");
  });

  it("keep mine dismisses, and this tab's next write still lands", async () => {
    render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Mine" } });
    writeFromOtherTab("Theirs");
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: thisKey() })); });
    fireEvent.click(screen.getByRole("button", { name: /keep mine/i }));
    await settle();
    expect(screen.queryByText(/changed in another tab/i)).toBeNull();
    expect(loadWeek(thisMonday()).weekGoal).toBe("Mine");
  });

  it("drops the notice when the week changes", async () => {
    const { container } = render(<StudyPlanner />);
    fireEvent.change(goalInput(), { target: { value: "Mine" } });
    writeFromOtherTab("Theirs");
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: thisKey() })); });
    expect(screen.getByText(/changed in another tab/i)).toBeInTheDocument();
    fireEvent.click(container.querySelectorAll("button")[1]); // next week
    await settle();
    expect(screen.queryByText(/changed in another tab/i)).toBeNull();
  });

  it("stops listening once unmounted", async () => {
    // Asserted on removeEventListener rather than on "nothing throws": React 18
    // dropped the setState-after-unmount warning, so a not.toThrow() version of
    // this would pass with the listener still live — a test that looks like
    // coverage and is not.
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<StudyPlanner />);
    unmount();
    expect(remove.mock.calls.some(([type]) => type === "storage")).toBe(true);
    remove.mockRestore();
  });
});
```

- [ ] **Step 2: Run and confirm they fail**

Run: `npx vitest run src/test/cross-tab.test.tsx`
Expected: FAIL — `StudyPlanner` neither listens nor renders a notice. Report which fail and which pass vacuously.

- [ ] **Step 3: Add the imports**

```ts
import { readItem, writeItem, onExternalChange } from "@/lib/storage";
import CrossTabNotice from "./CrossTabNotice";
```

and add `getWeekKey` to the existing `@/lib/planner-data` import.

- [ ] **Step 4: Add the state, the subscription and the handlers**

Add beside the other state:

```ts
  // Another tab wrote the week on screen while this tab had edited it.
  const [conflict, setConflict] = useState(false);
```

Add an effect **after** `dirtyRef`/`pendingRef` are declared, since it reads them:

```ts
  // Another tab writing the week on screen. dirtyRef picks between the two
  // cases: a clean tab has nothing to lose and simply reloads, while a tab that
  // has edited this week is told rather than overwritten. The conflict belongs
  // to one week, so arriving at a week clears it.
  useEffect(() => {
    setConflict(false);
    const weekKey = `planner-${getWeekKey(currentDate)}`;
    return onExternalChange((key) => {
      // null means another tab called clear(), so everything changed.
      if (key !== null && key !== weekKey) return;
      if (dirtyRef.current) setConflict(true);
      else setRefreshKey((k) => k + 1);
    });
  }, [currentDate]);
```

Add the two handlers beside `updateField`:

```ts
  const reloadFromOtherTab = useCallback(() => {
    // Drop the pending write BEFORE reloading. The load effect calls
    // flushPendingSave first, so a bare refreshKey bump would write this tab's
    // stale copy over the other tab's work and then read back its own write.
    // Race-free rather than lucky: flushPendingSave returns early on a null
    // pendingRef, so a debounce timer firing in the gap is a no-op, and with
    // dirtyRef already false the save effect schedules no new one.
    pendingRef.current = null;
    dirtyRef.current = false;
    setConflict(false);
    setRefreshKey((k) => k + 1);
  }, []);

  const keepMine = useCallback(() => setConflict(false), []);
```

- [ ] **Step 5: Render the notice**

Insert directly **above** the carry-forward block, so both sit below the week chevrons:

```tsx
      {conflict && <CrossTabNotice onReload={reloadFromOtherTab} onKeepMine={keepMine} />}
```

It must render below both chevrons. `autosave.test.tsx` and `pending-save.test.tsx` reach the next week with `container.querySelectorAll("button")[1]`; a control inserted before either chevron repoints those at the wrong button, and they then fail looking like a save bug.

- [ ] **Step 6: Run and verify**

Run: `npx vitest run src/test/cross-tab.test.tsx`
Expected: PASS, 20 tests.

If an assertion fails, **do not weaken it.** Investigate; if you believe an expectation is genuinely wrong, STOP and report.

- [ ] **Step 7: Full verification**

- **`npx vitest run src/test/autosave.test.tsx src/test/pending-save.test.tsx src/test/today.test.tsx src/test/carry-bar.test.tsx`** — all must pass. These use positional button lookups and would break on a misplaced notice.
- `npm test` — expect **297 across 26**.
- `npm run lint` — 0 errors, exactly 10 warnings. `npx tsc --noEmit` clean. `npm run build` clean.

- [ ] **Step 8: Commit**

**Mutation self-review.** Apply each, confirm a test fails, restore, leave `src/` clean:

1. Drop `pendingRef.current = null` from `reloadFromOtherTab` — **the one that matters**
2. Drop `dirtyRef.current = false` from `reloadFromOtherTab` — **this one is expected to SURVIVE.** The load effect sets `dirtyRef.current = false` itself, and nothing runs between the bump and that effect which reads the flag. So the line is defensive, not load-bearing. Confirm that is actually why it survives, then either keep it with a comment saying it is belt-and-braces against the load effect changing, or delete it. **Do not add a test to force it green** — a test for a line with no observable effect would be asserting on implementation.
3. Invert the dirty test: `if (!dirtyRef.current) setConflict(true); else setRefreshKey(...)`
4. `if (key !== null && key !== weekKey)` → `if (key !== weekKey)` (null no longer relevant)
5. Remove the key check entirely, so any change reloads
6. Remove `setConflict(false)` from the subscription effect
7. Change the effect deps from `[currentDate]` to `[]`
8. Return nothing from the effect, so the listener is never removed

Report each as KILLED (naming the test) or SURVIVED, honestly. Do not silently add tests; propose killers in your report.

---

## Task 4: Full verification and notes

- [ ] **Step 1: Run everything**

`npm test` (expect 297 / 26), `npm run lint` (0 errors, exactly 10 warnings), `npx tsc --noEmit`, `npm run build`.

- [ ] **Step 2: Confirm the storage rule still holds**

Run: `grep -rn "localStorage" src --include=*.ts --include=*.tsx | grep -v "src/lib/storage.ts" | grep -v "src/test/"`
Expected: only comment lines.

- [ ] **Step 3: See it working in two real tabs**

Run `npm run dev`, open `http://localhost:8080/Daily-Log/` in **two** browser tabs on the same week.

1. Type a goal in tab A. Watch tab B pick it up without being touched.
2. Type in tab B, then type something different in tab A. Tab B should show the notice and keep its own text.
3. Press **Keep mine** in tab B, type once more, and confirm tab B's version is what survives.
4. Repeat, pressing **Reload** instead, and confirm tab A's version wins and tab B's edit is gone.
5. Put the two tabs on **different** weeks and confirm neither notices the other.

Step 4 is the one that matters: it is the case that would silently do the opposite if the pending write were not dropped.

- [ ] **Step 4: Update the working notes**

In `CLAUDE.md`: replace the "Two tabs still overwrite each other" entry under **Pick up here next** with a short section describing the new behaviour, the two traps above, and the accepted residue (a user who ignores the notice and keeps typing still wins). Update the **Baselines** test count.

- [ ] **Step 5: Commit**

---

## Self-review notes

| Spec section | Task |
| --- | --- |
| Detection (`onExternalChange`, null key, other-documents-only) | 1 |
| The notice (wording, `no-print`, guarded roles) | 2 |
| Response (clean reloads, dirty warns) | 3 |
| Reload drops the pending write first | 3 |
| "Dirty" means edited, not unsaved | 2 (wording), 3 (behaviour) |
| Conflict clears on week change | 3 |
| Scope: week keys only | 3 |
| Testing | 1-3, gathered in 4 |

Out of scope and deliberately absent: settings-key handling, merging, any lock or ownership scheme, and `BroadcastChannel`.
