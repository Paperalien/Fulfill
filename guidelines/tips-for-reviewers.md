# Tips for Reviewers

Guidance on writing findings that Claude Code can act on accurately. The finding template, severity table, and category definitions are in `guidelines/features-guide.md` § 7.

---
## Claude's capabilities

** Claude is incredibly powerful and works at a senior or principle level software engineer. Review feedback should be written to to that level of understanding.

** Claude has medium quality UI/UX  abilities. It gets the job done pretty well but isn't excellent. Any comments in this space will need to provide more detailed instructions and explanations.

** While generally excellent, Claude is prone to occasional hallucinations and omissions, and this is particularly true of the capabilities and configurations of outside tools and systems.

---

## How Claude Code processes your review

Claude Code reads the review document and implements changes in a single conversation. This is different from a human developer who can ask follow-up questions, hold context across days, or intuit what you meant. Write for a highly capable reader with no memory of prior context.

**Each finding must be self-contained.** Claude cannot reliably cross-reference between findings mid-implementation. If fixing F-003 depends on a decision made in F-001, state that dependency explicitly inside F-003 — don't assume it will be remembered.

**File paths must be exact and complete.** Claude navigates the codebase by path. `useMigration.ts` is ambiguous; `artifacts/pm-app/src/app/hooks/useMigration.ts` is not. Always use repo-root-relative paths.

**Line numbers are useful but not load-bearing.** Include them when you can, but Claude will re-read the file before editing anyway. What matters most is the exact symbol name (function, component, variable) plus a short code excerpt to anchor the location.

**"What to change" matters more than "what is wrong."** A finding that includes the intended fix — even as pseudocode or a direction — produces a more accurate result than one that only describes the symptom. If you genuinely don't know the fix, write `"Unknown — flag for developer decision"` rather than leaving the field blank. That tells Claude to pause and ask instead of guess.

**Severity drives implementation order.** Claude processes Critical → High → Medium → Low. Within a severity level, findings are addressed in document order. If a specific ordering within a level matters (e.g., F-002 must be done before F-004), say so inside each affected finding.

**Conflicting findings must be resolved by the reviewer.** If two findings point in opposite directions, Claude will attempt to reconcile them and may get it wrong. Resolve the conflict in the document, or flag it explicitly so the developer can decide before implementation begins.

---

## What to include per category

### Architecture and Code

- The exact function, hook, or module where the problem *originates* — not just where it surfaces.
- The failure mode under realistic conditions: network error, slow response, concurrent use, page refresh mid-flow.
- Whether the fix is local (change one function) or systemic (change a contract between multiple components).

### UI

- Which component, which state (loading / empty / error / populated), which viewport size if relevant.
- A screenshot or a precise visual description: "the Submit button overlaps the input border by 2px on viewport widths below 400px."
- Whether the issue is a code bug (wrong CSS value) or a design decision that needs revisiting.

### UX

- The user's mental model at the moment of confusion — what they expected and why.
- The specific panel, state, or flow: "when the user is on the merge-confirm panel and clicks Cancel, the popover resets to [choice] instead of [email], losing the email they typed."
- Whether the fix is copy, interaction design, or flow restructuring.

### Security

- Whether this is exploitable by a passive attacker (reads network traffic), an active attacker (manipulates requests), or a malicious user of the same device.
- The exact data or capability exposed.
- Whether a fix exists or whether this is an accepted risk given the product's current tier.

---

## What to avoid

**Avoid findings that only describe symptoms.** "Tasks sometimes disappear" is not actionable. "When `isAuthenticated` becomes true before `workspaceId` is set, `useApiTaskStore` fires with `workspaceId: null`, sending `GET /workspaces/null/tasks` which returns 404 and empties the task list" is actionable.

**Avoid combining multiple independent issues in one finding.** Each finding should require exactly one logical change. If two issues happen to be in the same file but need different fixes, split them into separate findings.

**Avoid style preferences filed as Medium or above.** "I would have done this differently" belongs as Advisory with a clear argument, not as a High finding.

**Avoid contradicting stated design decisions without argument.** `guidelines/features-guide.md` documents explicit decisions such as "no transition rules on kanban" and "no auth gate." Disagreeing with these is legitimate — but requires an argument, not just an alternative approach.

**Avoid empty recommendations.** Write `"Unknown — flag for developer decision"` if you don't know the fix, so Claude pauses and asks rather than guesses.

---

## Grouping and document structure

Organize findings in one of two ways — choose one and be consistent within the document.

**By severity (recommended for most reviews):** All Critical findings first, then High, then Medium, then Low, then Advisory. Within each severity level, order by area (auth → storage → UI → UX). This lets Claude implement in priority order without reordering.

**By feature area (useful for focused reviews):** Group all findings for Migration Flow together, then Auth State Machine, then each page. Include a severity index at the top so Critical and High findings across all areas are visible at a glance.

---

## Opening the review in a new Claude Code session

When handing the review to Claude Code, open a new conversation in the Fulfill project directory and start with:

> "I have a review document at `guidelines/reviews/review-[id]-[date].md`. Please read it and then read the files referenced in each finding before proposing any changes. Start with Critical findings, then High. For each finding, tell me what you plan to do before making the edit."

The instruction to read referenced files first prevents Claude from acting on the reviewer's description of the code without verifying the current state — code may have changed between the review and implementation sessions.
