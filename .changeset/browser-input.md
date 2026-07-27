---
"@mmx/browser-input": major
"@mmx/runtime": minor
"@mmx/editor-runtime": minor
---

Make `@mmx/browser-input` the shared keyboard/gamepad action owner (engine-only dependency) used by Web and Studio playtesting. `@mmx/runtime/browser` re-exports it for compatibility; binding helpers move out of the Web DesktopBridge.
