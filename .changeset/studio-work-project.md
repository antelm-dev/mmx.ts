---
"@mmx/studio": minor
---

Add untitled work projects to Studio: `editor.ensureProject()` turns the current level into the entry level of an unsaved project kept in the Studio profile (`work-projects/<id>`), without a confirmation or a recent-project entry. Its first Save asks for a name and an empty folder, then moves the whole project there and adds it to the recent projects. A work project left from an earlier run is listed on the Start tab under "Unsaved", to restore (with its recovery draft) or delete.
