# Checklist — <what this round tests>

<nav class="doc-toc">
<div class="doc-toc-title">Contents</div>
<a href="#how-to-read-a-test">How to read a test</a>
<div class="doc-toc-group">Tests</div>
<a href="#part-1--sign-in">Part 1 · Sign in</a>
<a class="l2" href="#11-sign-in-with-email">1.1 · Sign in with email</a>
<a class="l2" href="#12-a-wrong-password">1.2 · A wrong password</a>
<div class="doc-toc-group">Results</div>
<a href="#results-sheet">Results sheet</a>
</nav>

## How to read a test

Every test has the same shape:

1. **The heading** — its number and name.
2. **Pills** under it — who runs it and where: <span class="pill info">Tester</span> <span class="pill muted">staging</span>.
3. **A short intro** in *italics* — what the test proves.
4. **Numbered blocks:**
   - **1.1.1 · Do** — the steps, in order. Tick each one as you go.
   - **1.1.2 · Look for** — what should appear on screen. Answer **Yes** or **No**.
   - **1.1.3 · Pass when** — what must be true. Answer **Yes** or **No**.

**Answering:** open the command **TestMD: Run Checklist** (the ☑ button at the top right of the editor). A **No** asks
why; the reason is written under the check in this file, with the date and your name. When every check of a test is
Yes, **Mark test done** strikes its heading through.

| Style | Means |
|---|---|
| **Bold** | What you press, open or choose |
| `Code` | Exact text to type or match |
| *Italics* | Where you are, or a word that needs stress |
| <mark>Highlight</mark> | What must be true |
| <u>Underline</u> | A warning |

---

## Part 1 · Sign in

### 1.1 Sign in with email

<span class="pill info">Tester</span> <span class="pill muted">staging</span>

*Checks that a known user can sign in and lands on the dashboard.*

**1.1.1 · Do**
- [ ] **1.1.1.1** Open the sign-in page.
- [ ] **1.1.1.2** Type the test user's email and password.
- [ ] **1.1.1.3** Press **Sign in**.

**1.1.2 · Look for**
- [ ] **1.1.2.1** The **Dashboard** title.
- [ ] **1.1.2.2** Your name in the top right corner.

**1.1.3 · Pass when**
- [ ] **1.1.3.1** <mark>The dashboard opens within 3 seconds.</mark>

### 1.2 A wrong password

<span class="pill info">Tester</span> <span class="pill muted">staging</span>

*Checks that a wrong password is refused and says so.*

**1.2.1 · Do**
- [ ] **1.2.1.1** Sign out.
- [ ] **1.2.1.2** Sign in with the right email and the password `wrong-password`.

**1.2.2 · Pass when**
- [ ] **1.2.2.1** <mark>The page says the password is wrong.</mark>
- [ ] **1.2.2.2** <mark>You are <u>not</u> signed in.</mark>

---

## Results sheet

| # | Test | Result | Notes |
|---|---|---|---|
| 1.1 | Sign in with email | | |
| 1.2 | A wrong password | | |
