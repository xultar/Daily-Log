

# Weekly Study Planner — Campus-Style

A digital recreation of the Kokuyo Campus Study Planner notebook, fully interactive and printable.

## Layout (Two-Page Spread)
Mimics the physical notebook's two-page spread with a subtle spiral binding divider in the center.

### Header Bar
- **Weekly Goal** — editable text field spanning the left page
- **Week In Review** — editable text field on the right page  
- **Weekly Total** — auto-calculated hours & minutes (top-right corner)
- Week date selector to navigate between weeks

### Left Sidebar
- **Weekly To Do** — checklist with 6-8 items, add/remove rows

### 7 Daily Columns (3 left page + 4 right page)
Each column contains:
1. **Date field** — month/day picker
2. **Subject + To Do** — 6 rows, each with a subject text input and a checkbox
3. **Hourly Time Log** — rows for hours 6–24, with a grid (10/20/30/40/50 min markers) that users can click to shade/fill blocks to track study time
4. **Total** — auto-sums filled time blocks into h/m
5. **Memo** — small text area at the bottom

## Visual Style
- Clean, minimal, light blue accent color (#C5D9F1) matching the Campus notebook
- Thin grid lines, small readable fonts
- Notebook paper texture feel with white background

## Interactivity
- Click time-log cells to toggle them filled/unfilled (tracks study blocks)
- Checkboxes for to-do items
- All text fields are inline-editable
- Data persists in localStorage so it survives page refreshes
- Week navigation (previous/next) with independent data per week

## Print Mode
- "Print" button that triggers browser print
- Print-optimized CSS: hides navigation UI, sizes to B5/A4, preserves the grid layout
- Clean black & white output suitable for physical use

## Data
- All data stored in localStorage (no backend needed)
- Organized by week key (e.g., "2026-W10")

