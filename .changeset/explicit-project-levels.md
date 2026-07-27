---
"@mmx/engine": major
"@mmx/runtime": major
"@mmx/build-tools": patch
---

Remove the built-in Stage 1/2 level catalog and the LDtk authoring package. Scenes,
recorders, and shared runtime sessions now require an explicit project-compiled
level. The build factory CLI also resolves relative project paths from the
caller's working directory.
