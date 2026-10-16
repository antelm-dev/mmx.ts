---
"@mmx/studio": minor
"@mmx/project-schema": minor
---

Studio edits every level of a project: a Levels panel (activity bar) switches, adds, renames,
reorders and deletes levels and sets the entry level. Edits to a level you leave stay unsaved
until Save writes every level. With a project open, New Level and Open Level add a level
instead of replacing the entry level. `serializeProject` now keeps the manifest's level order.
