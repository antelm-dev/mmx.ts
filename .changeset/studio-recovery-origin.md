---
"@mmx/studio": patch
---

The recovery draft now records the project it was edited in. Restore Recovery Draft replaces a
level only with a draft from the same project; a draft from another project, from no project,
or from an older Studio is added as a new "(recovered)" level. The confirmation and the toast
say which of these happens, and an unreadable draft is no longer offered. Opening a project no
longer overwrites the draft: only an edit writes it, and a save clears it.
