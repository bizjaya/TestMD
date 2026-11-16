Some words before any heading.

- [ ] An item before the title.

#

# The edge book

<nav class="doc-toc">
<a class="l2" href="#part-1--duplicates">Part 1 · Duplicates</a>
</nav>

## Part 1 · Duplicates

What this part covers.

### 1.1 Same name

**1.1.1 · Do**
- [ ] **1.1.1.1** Step one.
- [x] **1.1.1.2** Step two.

### 1.1 Same name

**1.1.2 · Look for**
- [ ] **1.1.2.1** A check.
  - ❌ **No** · 2026-11-05 · Ann — It broke, see img1.
    ![img1](edge.assets/a.webp)
  - ~~❌ **No** · 2026-11-04 · Ann — Blank.~~
- [ ] **1.1.2.2** Another check.
  - 📝 **Note** · 2026-11-05 · Ann — Slow.

## Part 1 · Duplicates

- [x] The same part name again.

# A second H1 is a part

```bash
## not a heading: a shell comment in a fence
# nor this
```

~~~~
## inside tildes
~~~
## still inside: the closing fence is shorter
~~~~

Setext heading
--------------

**Steps:**
- [ ] An item under a setext heading.

<div>
## inside an HTML block, no blank line before it
</div>

## Part 3 · After the HTML block

<!--
## inside a comment

## still inside the comment
-->

- [ ] **3.1** After the comment.

## Part 4 | Table head
--- | ---
a | b

> ## A heading in a quote
> - [ ] A quoted item.

### ~~4.1 Done already~~ <span class="pill success">Done</span>

- [x] **4.1.1** Done.

## ~~Part 5 · Marked done~~ <span class="pill success">Done</span>

Prose only.

## Part 6 · Last

### 6.1 Duplicate of a later name

- [ ] **6.1.1** Last but one.

### 6.1 Duplicate of a later name

1. [ ] **6.1.2** An ordered item.
2. [x] **6.1.3** Another.

```
an unclosed fence at the very end
## swallowed
