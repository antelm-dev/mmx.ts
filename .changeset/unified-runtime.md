---
"@mmx/runtime": minor
"@mmx/browser-runtime": major
"@mmx/browser-input": major
"@mmx/editor-runtime": minor
---

Add `@mmx/runtime` as the shared simulation runtime for Web and Studio (`core`, `browser`, `player`, `tooling` entry points). `@mmx/browser-runtime` becomes a compatibility re-export of `@mmx/runtime/browser` (FixedStepLoop). Physical keyboard/gamepad input is owned by `@mmx/browser-input` and re-exported from `@mmx/runtime/browser`. `@mmx/editor-runtime` now adapts LevelDocument playtesting onto `@mmx/runtime/tooling` instead of owning its own loop and session.
