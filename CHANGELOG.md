# Changelog

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
