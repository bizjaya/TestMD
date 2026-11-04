# TestMD

Run Markdown checklists inside VS Code. Tick each step, answer **Yes** or **No** to each check, and when something
fails, write why right under it. Everything is saved in the `.md` itself, so the results live in git next to the
checklist, and anyone (or any tool) can read them as plain text.

## What you get

- **TestMD: Run Checklist** (the ☑ button at the top right of a Markdown file's tab, or of its preview's tab) opens the
  checklist beside the editor:
  - a **tick** for each step you do,
  - **Yes / No** for each thing you check. **No** asks what went wrong, then writes it under the check with the date and
    your name;
  - a count in the corner: Yes, No, still to check, steps ticked;
  - **Mark test done** on a heading once every check under it is Yes: the heading is struck through and gets a Done
    pill, and links to it (in a menu, a results table) follow the new anchor.
- **Find (Ctrl+F)** in the panel and in VS Code's own Markdown preview: every match highlighted, `3 of 17`, the current
  one scrolled into view. Enter / Shift+Enter (or F3 / Shift+F3) to step, Esc to close, **Aa** to match case.
- **The checklist look** in VS Code's own preview too: status pills, highlighted pass conditions, warnings, struck-through
  done headings, an optional floating table of contents, and each item's answer shown as a badge.
- **TestMD: New Checklist** writes a starter checklist from the template.

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

The panel also loads the stylesheets in your `markdown.styles` setting, so a checklist looks the same as in VS Code's
preview.

## Good to know

- VS Code's own preview is read-only: it shows each answer as a badge and a note saying where to answer. Ticking and
  answering happen in the Run Checklist panel.
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
