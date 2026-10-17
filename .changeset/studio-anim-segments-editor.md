---
"@mmx/studio": minor
---

The clip editor edits a clip's named segments: Add segment cuts the segment holding the selected frame, and each segment can be renamed (non-empty, unique, without `#`), resized by its last frame, set to loop or play once, or deleted into its neighbour; Remove all segments gives a plain clip back. Segments follow frames that are moved, duplicated or removed, the timeline marks each frame's segment, the preview plays the segments from a chosen one, and every edit is one undo step. Adding segments drops `loopStart`, which segments replace.
