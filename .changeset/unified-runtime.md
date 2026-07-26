---
"@mmx/runtime": minor
"@mmx/browser-runtime": major
"@mmx/browser-input": major
"@mmx/editor-runtime": minor
---

Add `@mmx/runtime` as the shared simulation runtime for Web and Studio (`core`, `browser`, `player`, `tooling` entry points). `@mmx/browser-runtime` and `@mmx/browser-input` become compatibility re-exports of `@mmx/runtime/browser`. `@mmx/editor-runtime` now adapts LevelDocument playtesting onto `@mmx/runtime/tooling` instead of owning its own loop and session.
