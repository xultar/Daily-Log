# Colour in the month view

Date: 2026-08-26
Status: approved

## Summary

A month cell says how much time a day took and never what it was spent on. Tint
each cell with the day's dominant tag, and name that tag in the cell.

## Motivation

The month view is the only place that shows a whole month at once, and it is the
one view that cannot answer "what was I doing". It shows a minutes pill shaded
by total time, so a heavy month and a light one look different, but a month of
thesis and a month of admin look identical.

`calcDayColorMinutes` has totalled a day by tag since the palette gained
per-colour minutes. Nothing consumed it here.

## Decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| What a cell shows | The dominant tag, not the mix | One colour reads at 100x70px; segments do not |
| Where the colour goes | The whole cell background | It is meant to read as a heat map across a month |
| Strength | Alpha scaled by minutes | Hue says what, strength says how much |
| The minutes pill | Loses its coloured fill | The cell now carries intensity; two encodings of one number is muddle |
| Ties | Earliest display position wins | That is the order the user sees tags in |
| The tag name | Shown in the cell | Colour alone is the encoding this palette measurably cannot carry |
| Hover | A ring, not a background | An inline background beats a hover background class |

Rejected alternatives:

- **A proportional bar per day.** Shows the mix, which is more information, and
  at 100px wide a day split four ways gives 25px unlabelled segments.
- **Dots, one per tag used.** Answers "did I touch this" rather than "what was
  this day", and the pill already carries the total.
- **Tinting only the minutes pill.** Safe and contained, and too small a patch
  of colour to read as a heat map at arm's length.

## The dominant tag

A new pure function in `planner-data.ts`:

    dominantTag(day: DayData): number | null

The storage id with the most minutes in that day, or null when nothing is
painted. It builds on `calcDayColorMinutes`, which already keys minutes by
storage id.

**Ties break toward the earliest display position**, not the lowest storage id.
The two disagree for four of the twelve colours, and display position is the
order the user sees in the legend, so it is the order that will look
non-arbitrary. `displayPositionForColorId` does the translation; nothing here
does it by hand.

Returning a storage id, never a display position, is the usual contract: the id
is what indexes the palette and what the `--tag-N` custom properties are keyed
by.

## The cell

- **Background** is `hsl(var(--tag-N) / α)` for the dominant tag, with
  `α = 0.15 + intensity * 0.6`, where `intensity` is the existing
  `min(minutes / 240, 1)`. A ten-minute day is a hint; a four-hour day is
  unmistakable. The exact range is to be checked in a browser in both themes
  and adjusted there, not argued about here.
- **The tag name** is the custom label if one is set, otherwise the palette's
  own — the same value the legends show, so the three agree.
- **The minutes** stay, as plain text. The pill's fill goes.
- **A day with no time** is unchanged: no tint, no name, no minutes.

Days outside the displayed month keep their existing `opacity-40`, which dims
the tint along with everything else and needs no special handling.

## Two things that are easy to miss

**Hover breaks silently.** The cell has `hover:bg-primary/10`, a class. An
inline `backgroundColor` wins over it, so hover would stop doing anything on
exactly the days that have data — invisible in a screenshot, obvious in use.
Hover becomes a ring, which is independent of the background.

**Double encoding.** The pill's opacity and the cell's alpha would both be
saying "minutes". The pill keeps the number and loses the shading.

## Accessibility, and print

Colour alone is the encoding this palette is now measured to be unable to carry.
`palette-colourblind.test.ts` puts several pairs at ΔE 0.7 to 2.8 under
deuteranopia and tritanopia — the same colour, for practical purposes. A view
whose entire message is hue is unreadable for those users, and prints as a page
of identical greys on the mono laser this app supports on purpose.

The tag name is the non-colour channel that fixes both, and it is more useful
than a shade for everyone: "Thesis" needs no legend.

This is the same reasoning that put run numbers on printed time blocks. It is
cheaper here, because a month cell has room for a word.

## Testing

`dominantTag`, as a pure function:

- The tag with the most minutes wins.
- A tie goes to the earlier display position, using a pair where display
  position and storage id disagree, so the test fails if the ids are compared
  instead.
- A day with nothing painted returns null.
- A day with one tag returns it.
- A damaged `timeBlocks` returns null rather than throwing.

Then the view:

- A day's cell carries its dominant tag's custom variable.
- The tag's name appears in the cell.
- A day with no time has no tint and no name.
- Hover does not rely on a background class.

Every new test is mutation-tested.

## Out of scope

- Showing the mix. The dominant tag is the whole idea.
- Any change to the day or week views.
- Making the month view printable in colour, beyond what the tag name gives.
- Filtering the month by tag — that belongs with "find when you last used a
  tag", which is backlogged.

## Risks

**The tint fights the text.** A cell carries a date, a tag name and a total over
a coloured background, in two themes. The alpha range is a guess until it is
looked at, and the check is a browser rather than an argument.

**Three lines in a 70px cell.** Date, name, minutes. It may need to grow, and a
long custom label will need truncating.
