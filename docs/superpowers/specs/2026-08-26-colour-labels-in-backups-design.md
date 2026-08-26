# Colour labels in backups

Date: 2026-08-26
Status: approved

## Summary

The JSON export carries weeks and nothing else, so restoring a backup on a new
device brings back every week you planned and none of the names you gave your
colour tags. Add them, as a `settings` section, and bump the export format to
version 2.

## Motivation

`exportAllData` collects entries whose key matches `planner-YYYY-Www` and skips
everything else. That filter is correct and it exists for a good reason:
`planner-color-labels` was once collected as though it were a week, which
exported it as one and then broke `exportAsCSV` on the first one it reached.

The fix was to match the entry shape rather than the prefix. It stopped the
crash, and it also quietly reclassified the labels from exported to not
exported. Nobody was looking at that axis, because the bug being fixed was about
weeks.

The labels are the only user-typed content in this app that does not live inside
a week, so they fall through every week-shaped net. With twelve tags they matter
more than they did with nine: a restore that hands back twelve colours called
Blue, Pink and Green has lost the thing that made them mean anything.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| What travels | Colour labels only | They are content; the rest are device preferences |
| Format version | Bump to 2, accept 1 and 2 | Old backups must still restore |
| Old builds reading v2 | Refuse, loudly | Better than silently dropping the labels |
| Merge on import | Per-id overwrite, others untouched | Exactly how weeks already behave |
| Invalid entries | Dropped, import still succeeds | Weeks are the payload; a bad label is not worth failing a restore |

Rejected alternatives:

- **Adding `settings` without bumping the version.** The version check is
  `!== 1`, so an optional field would keep every file importable in both
  directions — and that is the problem. An older build would accept a v2 file
  and silently discard the labels inside it. Refusing is the better failure.
- **Carrying `planner-show-weekends` and the theme too.** They are per-device
  preferences. Restoring last month's data should not also change whether
  weekends are showing or what colour the app is. A data restore should restore
  data.
- **Replacing the whole label set on import.** Simpler, but it would delete
  labels for tags the file says nothing about — which is not what importing a
  set of weeks does, and there is no reason for labels to behave differently.

## The format

    {
      "version": 2,
      "exportedAt": "2026-08-26T12:00:00.000Z",
      "weeks": { ... },
      "settings": {
        "colorLabels": { "1": "Thesis", "10": "Admin" }
      }
    }

`settings` is optional on read. A v1 file has none, and a v2 file written when
no labels were set may reasonably omit it or carry an empty object; both mean
the same thing and neither is an error.

Keys are storage ids as strings, because JSON object keys are always strings.
They are storage ids, never display positions — the same contract as
`timeBlocks`, and the reason `planner-color-labels` is keyed that way already.

## Import

`importFromJSON` accepts `version` 1 or 2 and rejects anything else with the
message it already uses.

Labels are validated before they are written, because the file is untrusted:

- the key must parse as an integer within `BLOCK_COLORS`,
- the value must be a string.

Anything else is dropped. `loadColorLabels` does no shape checking of its own —
it returns whatever `JSON.parse` produced — so a malformed entry written here
would be handed straight to the legend.

Valid entries are merged over the existing labels by id and saved through
`saveColorLabels`, which keeps `planner-data.ts` the only module that knows the
key. Ids the file does not mention keep whatever they had.

Labels are written after the weeks. If that write fails when the weeks
succeeded, the import still reports success: the weeks are what the user came
for, and failing a restore that restored everything important would be worse
than losing the names again.

## Testing

- A round trip carries labels: set labels, export, clear storage, import, and
  the labels are back.
- A v1 file still imports, and leaves existing labels alone rather than
  clearing them.
- A v2 file with no `settings` imports.
- An import merges: an id the file does not mention keeps its local label.
- An id the file does mention is overwritten.
- A non-string value and an out-of-range key are both dropped, and the import
  still succeeds.
- `exportAllData` still exports no settings entry as a week — the original bug
  stays fixed, and `exportAsCSV` still runs.
- Every new test is mutation-tested.

## Out of scope

- Carrying any other setting.
- Reporting how many labels were imported. `ImportResult` is rendered by the UI
  and its shape is not worth changing for a number nobody acts on.
- Validating label length or content. The app already lets a user type anything
  into that field.

## Risks

**A backup written today cannot be read by a build from yesterday.** That is
deliberate and it is the point of the version bump, but it is a one-way door:
anyone keeping an old deployment around will find their new exports rejected.
Given this app is one deployment on GitHub Pages, that is theoretical.

**Merging can resurrect a label you deleted.** Clear a tag name locally, import
a backup written before you cleared it, and the old name returns. That follows
directly from per-id merge, it is what weeks already do, and the alternative —
letting a file blank out labels it never mentions — is worse.
