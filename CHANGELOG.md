# Changelog

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
