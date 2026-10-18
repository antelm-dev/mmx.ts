---
"@mmx/runtime": major
---

`SceneOptions.gameData` is required (the engine ships no player), so the `scene` option of `createPlayerRuntime`, `createToolingRuntime` and `RuntimeSession`, and `replaceScene`, must carry the project's compiled game data.
