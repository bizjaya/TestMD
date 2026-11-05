# TestMD

Run Markdown checklists inside VS Code. Tick each step, answer **Yes** or **No** to each check, and when something
fails, write why right under it, with screenshots. Everything is saved in the `.md` itself, so the results live in git
next to the checklist, and anyone (or any tool) can read them as plain text.

Made for test books and acceptance runs, and just as good for any checklist: a release runbook, an onboarding list, a
to-do list. Any `- [ ]` list in a Markdown file works.

## What you get

- **Open in TestMD** (the square-with-a-tick button at the top right of a Markdown file's tab or of its preview's tab) opens the
  checklist beside the editor:
  - a **tick** for each step you do,
  - **Yes / No** for each thing you check. **No** asks what went wrong, then writes it under the check with the date and
    your name;
  - a **Note** on any step or check (it shows when you point at the item): text, and pictures pasted with Ctrl+V or
    dropped in. The No box takes pictures too. Use them for the issue you hit, or as proof that something works;
  - a count in the corner: Yes, No, still to check, steps ticked, and an **Auto / Light / Dark** switch for the whole
    panel, menu included;
  - a floating menu (if the checklist has one) you can widen or narrow by dragging its edge; double-click the edge to
    reset it;
  - **Mark test done** on a heading once every check under it is Yes: the heading is struck through and gets a Done
    pill, and links to it (in a menu, a results table) follow the new anchor.
- **Find (Ctrl+F)** in the panel and in VS Code's own Markdown preview: every match highlighted, `3 of 17`, the current
  one scrolled into view. Enter / Shift+Enter (or F3 / Shift+F3) to step, Esc to close, **Aa** to match case.
- **The checklist look** in VS Code's own preview too: status pills, highlighted pass conditions, warnings, struck-through
  done headings, an optional floating table of contents, and each item's answer shown as a badge.
- **TestMD: New Checklist** writes a starter checklist from the template.
- **TestMD: Archive Round** (also **Archive round** in the panel) copies the checklist and its pictures to
  `archive/<name>-<date>/` beside it, then clears every tick, answer, note and picture, ready for the next round.

## How a checklist is written

Plain GitHub task lists. A list under a line ending in **Do** (or **Steps**) is a list of steps; every other checkbox is
a check.

```markdown
### 1.1 Sign in with email

**1.1.1 · Do**
- [ ] **1.1.1.1** Open the sign-in page.
- [ ] **1.1.1.2** Press **Sign in**.

**1.1.2 · Pass when**
- [ ] **1.1.2.1** <mark>The dashboard opens within 3 seconds.</mark>
```

After a run:

```markdown
**1.1.1 · Do**
- [x] **1.1.1.1** Open the sign-in page.
- [x] **1.1.1.2** Press **Sign in**.

**1.1.2 · Pass when**
- [ ] **1.1.2.1** <mark>The dashboard opens within 3 seconds.</mark>
  - ❌ **No** · 2026-11-04 · Ann — it took 9 seconds on the first load.
```

- `[x]` is Yes (or a step done). An empty box with a `❌ No` line under it is No. An empty box alone is not checked yet.
- Answering Yes later ticks the box and strikes the old reason through (`~~❌ No …~~`), so the history stays visible.
- Done: `### ~~1.1 Sign in with email~~ <span class="pill success">Done</span>`.

### Notes and pictures

```markdown
- [x] **1.1.2.2** <mark>Your name shows.</mark>
  - 📝 **Note** · 2026-11-05 · Ann — top right, as expected (img4).
    ![img4](checklist.assets/3f2a9c1e-5b7d-4e0a-9c1b-2d8e6f4a7b90.webp)
```

- **Saved with the note.** A pasted picture stays in the panel until you save the note; leaving it out or cancelling
  writes nothing. On save it is shrunk to at most 1,600 px on its longest side and saved as WebP in a folder named
  after the checklist (`checklist.assets/<GUID>.webp`). Nothing is embedded in the `.md`, so the file stays small and git
  shows each picture as its own file. Opening the panel deletes any picture the checklist no longer links to.
- **Numbered across the checklist.** Pictures are img1, img2 … in the order pasted; the label shows at each picture's
  top-left and is the link's alt text, so a note (or a colleague, or a tool) can name one exactly: "see img4".
- **Gaps close.** Delete a picture (its × in the panel, or leave it out of the box before saving) and the later ones
  move up a number; the notes' own "imgN" words follow, and a mention of the deleted one reads *(picture deleted)*.

### Pills, highlights and the menu

```markdown
<span class="pill info">Tester</span> <span class="pill muted">staging</span>
<mark>what must be true</mark> · <u>a warning</u>

<nav class="doc-toc">
<div class="doc-toc-title">Contents</div>
<a href="#11-sign-in-with-email">1.1 · Sign in with email</a>
</nav>
```

Pill colours: `success`, `warning`, `danger`, `info`, `muted`. The menu has no blank lines inside it.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `testmd.userName` | *(empty)* | The name on a No. Empty: your git `user.name`, else your login name. |
| `testmd.saveAfterEachAnswer` | `true` | Save the file after every answer. |
| `testmd.stepLabels` | `["Do", "Steps"]` | The words that make a list a list of steps (a tick, not Yes / No). |
| `testmd.panelTheme` | `auto` | The panel's colours: `auto` follows the editor, `light` or `dark` always. The switch in the panel sets it. |

## Good to know

- VS Code's own preview is read-only: it shows each answer as a badge and a note saying where to answer. Ticking and
  answering happen in the TestMD panel.
- Find takes over Ctrl+F in VS Code's preview only while the preview has focus. Click into it first.
- The panel edits only the lines an answer changes, so undo works and edits elsewhere in the file are kept. If the file
  changed under an answer, the panel reloads and asks you to answer again.
- Scripts written inside a checklist never run: the panel only runs its own code.

## Building

```
npm install
npm test
npx vsce package
```

## License

[MIT](LICENSE) © BizJaya TechLab S/B
