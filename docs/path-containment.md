# Filesystem path containment

Studio project exports are treated as untrusted input. Every
manifest-referenced file that `@mmx/build-tools` reads, hashes, parses, copies,
or serves must remain under the real project (or emit) root after filesystem
links are resolved.

## Layers

1. **Lexical validation** (`resolveProjectPath`, `resolveEmittedAssetPath`)
   Rejects `..`, absolute paths, backslashes, and other non-portable syntax
   before any filesystem access.
2. **Real-filesystem containment** (`containAbsolutePath`,
   `resolveContainedProjectPath`, `containEmittedAssetPath`)
   Resolves the candidate with `fs.realpath` (and walks existing ancestors for
   missing leaves) and requires the final real path to stay inside
   `realpath(root)`.

## Policy for links

| Situation                                                                            | Result                                                                  |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Ordinary file under the root                                                         | Allowed                                                                 |
| Symlink / junction / directory symlink whose final real target stays inside the root | Allowed                                                                 |
| Symlink / junction / directory symlink whose final real target escapes the root      | Rejected with `path.traversal` (or `asset.path` for emitted asset URLs) |
| Lexical `..` / absolute / mixed separators                                           | Rejected with `path.traversal` / `asset.path` before realpath checks    |

Missing files are still reported with the established logical codes
(`asset.missing`, `level.missing`, `manifest.missing`). Containment only
upgrades a path to `path.traversal` when an existing link (or an existing
ancestor link) escapes the root.

## Emit / dev serving

The emit directory is created by core, but an attacker who can plant a
pre-existing symlink under `emit/assets` must not be able to serve outside
bytes. After the lexical URL check, the middleware runs
`containEmittedAssetPath` and reads the contained real path. Escapes return
HTTP 400 without leaking absolute filesystem paths.

## Residual TOCTOU

Checks use `realpath` immediately before the corresponding `readFile` /
`copyFile`. A process with write access to the project or emit tree can still
replace a path between the check and the open (classic TOCTOU). Node's public
`fs` APIs do not provide a portable open-without-follow that closes this race
on every platform. Call sites keep the contained real path as close as possible
to the I/O operation; residual races require compromised write access to the
same tree being validated.
