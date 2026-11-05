# Changelog

## 0.1.0 (2026-11-04)

- The TestMD panel (Open in TestMD): a tick for each step, Yes / No for each check, a reason written under every No, a count of
  answers, and Mark test done for a heading whose checks are all Yes. An Auto / Light / Dark switch for the whole
  panel, and a floating menu you resize by dragging its edge.
- Find (Ctrl+F) in the panel and in VS Code's own Markdown preview.
- The checklist look (pills, highlights, done headings, floating menu, answer badges) in VS Code's own preview, which
  stays read-only: a note says where to answer, and the Open in TestMD button sits on the preview's tab too.
- New Checklist: a starter checklist from the template.
- Notes on any step or check, with pictures pasted or dropped in (also in a No's reason): saved as WebP files beside the
  checklist (`<name>.assets/<GUID>.webp`) and linked from it. Click a picture to see it full size.
- Archive Round: copies the checklist and its pictures to `archive/<name>-<date>/`, then clears it for the next round.
