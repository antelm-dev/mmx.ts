---
"@mmx/studio": minor
---

Studio: « New object… », « Import sprite sheet… » and « New animation… » work without an open project. The first one used turns the current level into an untitled project, then opens its dialog; the first Save asks for a name and a folder. With no animation in the project, the enemy step of « New object… » says so and offers « Import sprite sheet… » and « New animation… » instead of a disabled Create button.

Creating an object brings the level forward over the Start tab or a document, so it can be placed right away. A new project without `game/data.json` no longer reports it in Problems: Play uses the starter's bindings with the project's own assets, and choosing a player animation there writes, on Save, a `game/data.json` seeded from the starter's together with the starter assets it binds, so the project still builds. Export refuses a `game/data.json` that binds an asset missing from the project.
