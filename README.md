# TestMD

Run Markdown checklists inside VS Code. Tick each step, answer **Yes** or **No** to each check, and when something
fails, write why right under it, with screenshots. Everything is saved in the `.md` itself, so the results live in git
next to the checklist, and anyone (or any tool) can read them as plain text.

Made for test books and acceptance runs, and just as good for any checklist: a release runbook, an onboarding list, a
to-do list. Any `- [ ]` list in a Markdown file works.

## What you get

- **Open in TestMD** (the square-with-a-tick button at the top right of a Markdown file's tab or of its preview's tab) opens the
  checklist beside the editor, laid out like a small website:
  - **a header** with the checklist's title, where you are in it, Find, and how much is left;
  - **a contents menu** on the left that folds by section, with its own filter (words, or *Not done* / *With a No*).
    A section shows how many of its tests are done (`0/3`); each test under it, how many of its rows are answered (`6/8`),
    with a red dot when one is a No.
    **☰** hides it; drag its edge to widen or narrow it;
  - **a table per section** (each `##` heading): a row per test or sub-heading, its block labels (*Do*, *Look for*,
    *Pass when*) as sub-rows, and each step or check as a row with its answer in the last column:
    - **every count reads the same way:** *answered of total*, then the No answers in red (`4 of 4 · 2 No`), and the bar
      under it has the same three parts: green for Yes or done, red for No, grey for what is left. A section's header
      shows its tests done on one line and its answers, with their bar, on the next;
    - a **tick** for each step you do,
    - **Yes / No** for each thing you check. **No** asks what went wrong, then writes it under the check with the date
      and your name;
    - a **note** button on every row: text, and pictures pasted with Ctrl+V or dropped in (the No box takes pictures
      too). Notes and reasons open in a row under their item;
  - **Collapse / Expand** on each section and above them all, to see one row per test; a test's arrow folds just that
    test (Alt+click folds every test of its level in that section);
  - **Mark test done** on a test once every check under it is answered and none is No: its heading is struck through
    and gets a Done pill, and links to it (in a menu, a results table) follow the new anchor;
  - **the CHECKLIST leaf** on the right edge, with what is left, the number of No answers and of notes, each number labelled. It opens a
    panel: the totals, **Next to answer** and **Next No**, a filter (All, Left, No, Notes), every section with its
    progress, the **Auto / Light / Dark** switch, colours, and **Archive round**. Drag the leaf up or down; pin the
    panel beside the page or let it lie over it.
- **Find (Ctrl+F)** in the panel and in VS Code's own Markdown preview: every match highlighted, `3 of 17`, the current
  one scrolled into view. Enter / Shift+Enter to step, Esc to close, **Aa** to match case.
- **Colours**: six presets and a picker for each part of the look (primary, secondary, tick and Yes, No, notes, the
  pass highlight, Find matches, test rows), kept in the `testmd.colors` setting, so a team can share them.
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
| `testmd.panelTheme` | `auto` | The panel's theme: `auto` follows the editor, `light` or `dark` always. The switch in the panel sets it. |
| `testmd.colors` | `{}` | The panel's colours, one per role (`primary`, `secondary`, `yes`, `no`, `note`, `mark`, `find`, `test`), each `#rrggbb`. The pickers in the panel set them. |

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
