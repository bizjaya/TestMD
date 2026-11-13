# Changelog

## 0.2.6 (2026-11-13)

- The highlight follows your clicks only. Click a section in the contents, or anywhere in a section on the page, and
  that section is highlighted in both places; scrolling no longer moves it to whatever reaches the top. A click on the
  page also opens its part in the contents and brings its line into view. The highlight is kept when the page is
  drawn again and when the panel is reopened. The breadcrumb above still names where you have scrolled to.

## 0.2.5 (2026-11-10)

- The section the contents highlight is highlighted on the page as well: its heading row and every row under it, down
  to the next heading of its level, take the same ground and edge as its line in the contents, whether you clicked it
  there or scrolled to it. A row you answer stays highlighted.

## 0.2.4 (2026-11-09)

- The contents menu shows each count as a percentage. A section reads how far through its tests you are, a test marked
  done counting whole and any other by the share of its rows answered, so a section whose tests are mostly answered no
  longer reads `0/3` as if nothing were done. Each test reads the share of its rows answered (`75%`). Pointing at a
  count still gives the numbers (`3 of 4 tests done`, `6 Yes or done · 1 No · 1 left, of 8`).

## 0.2.3 (2026-11-09)

- Every count reads the same way: *answered of total*, then the No answers in red, such as `4 of 4 · 2 No`. A *Do*,
  *Look for* or *Pass when* row counts like its test (`4 of 5`, `2 of 2 · 1 No`) instead of `4 Yes of 5`.
- Every bar shows exactly the words beside it: green for Yes or done, red for No, grey for what is left.
- A section's header gives its tests done on one line and its answers on the next (`13 of 16 answered · 4 No`), with the
  bar under the answers. Before, the bar counted answers while the words above it counted tests.
- In the contents menu, each test under a section shows its own count (`6/8`), with the red dot when one is a No; a
  section still shows its tests done (`0/3`). Pointing at any count says what it counts.
- A box left empty under a test marked done counts as done, not as left to answer, and Next to answer skips it.
- The CHECKLIST leaf names each number (left, No, notes), so equal numbers are not read as one.

## 0.2.2 (2026-11-06)

- A copy button at the end of every part title, test title and step or check copies its number and words, such as
  `16.2.1.1 - Go to FinG Research › FinTemplates.` or `Part 16 - FinGraph — FinResearch to Telegram`, ready to paste
  wherever you report what you found. It is faint until you point at the row.

## 0.2.1 (2026-11-05)

- Answering is about 100 times lighter on a long checklist: when the file changes, only the rows that changed are
  drawn again, instead of the whole page. On a 2,500-row checklist that is about 3 ms instead of 300 ms an answer.
- Scrolling does less: the crumbs and the contents highlight change only when you move into another section, and the
  place kept for the next redraw is saved once scrolling stops.
- A hidden Checklist tab does no work. A change made while it is hidden is drawn when the tab shows again.
- Typing in the .md redraws the panel once you pause, not on every key.
- The progress panel is drawn only while it is open, and dragging the colour picker restyles the page once a frame.
- Marking a test done keeps your place. Picking a heading or a part in the contents puts it at the top of the page,
  so the crumbs and the contents name it.

## 0.2.0 (2026-11-05)

- The panel is laid out like a small website: a header with the checklist's title, where you are, Find and what is
  left; a contents menu that folds by section, with its own filter and a **☰** to hide it; and a table per section
  with a row per test, its block labels as sub-rows, each step or check as a row with its tick or Yes / No in the last
  column, and notes in a row under their item.
- Collapse / Expand on each section and for all of them; Alt+click a test's arrow to fold every test of its level.
- The count in the corner moved into the CHECKLIST leaf on the right edge: what is left, No answers and notes on the
  leaf; totals, Next to answer, Next No, a filter, every section's progress, the theme switch, colours and Archive
  round in its panel, pinned beside the page or lying over it.
- Colours: six presets and a picker per role, kept in the new `testmd.colors` setting.

## 0.1.0 (2026-11-04)

- The TestMD panel (Open in TestMD): a tick for each step, Yes / No for each check, a reason written under every No, a count of
  answers, and Mark test done for a heading whose checks are all Yes. An Auto / Light / Dark switch for the whole
  panel, and a floating menu you resize by dragging its edge.
- Find (Ctrl+F) in the panel and in VS Code's own Markdown preview.
- The checklist look (pills, highlights, done headings, floating menu, answer badges) in VS Code's own preview, which
  stays read-only: a note says where to answer, and the Open in TestMD button sits on the preview's tab too.
- New Checklist: a starter checklist from the template.
- Notes on any step or check, with pictures pasted or dropped in (also in a No's reason): kept in the panel until the
  note is saved, then written as WebP files beside the checklist (`<name>.assets/<GUID>.webp`) and linked from it.
  Pictures are numbered img1, img2 … across the checklist, labelled on the picture and in the link; deleting one closes
  the gap and the notes' mentions follow. Opening the panel deletes pictures nothing links to. Click a picture to see
  it full size.
- Archive Round: copies the checklist and its pictures to `archive/<name>-<date>/`, then clears it for the next round.
