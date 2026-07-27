# @mmx/build-tools

Node-side compiler and Vite integration for turning a portable MMX Studio
export into a browser-ready project bundle. It validates the export, compiles
levels and game data, fingerprints assets, and keeps host builds free of
machine-specific absolute paths.

## Entry points

| Import                  | Purpose                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `@mmx/build-tools`      | Project loading, compilation, disk emission, path containment, and shared constants |
| `@mmx/build-tools/vite` | Vite project plugins and rebuild scheduling                                         |

## Compile a project

```ts
import { buildProjectToDisk, requireProject } from "@mmx/build-tools";

const project = await requireProject("path/to/studio-export");
const report = await buildProjectToDisk(project, "dist-project");
```

`requireProject()` throws `ProjectLoadError` when validation fails.
`buildProjectToDisk()` writes content-hashed assets, `project-bundle.json`, and
`asset-manifest.json`; compilation failures use `ProjectBuildError`.

The repository also exposes the same workflow as:

```bash
pnpm factory:build -- --project <studio-export> [--out-dir <directory>]
pnpm factory:dev -- --project <studio-export>
```

## Vite integration

```ts
import { createMmxProjectPluginsFromEnv } from "@mmx/build-tools/vite";

export default {
  plugins: createMmxProjectPluginsFromEnv(),
};
```

With `MMX_PROJECT` set, the plugin provides `virtual:mmx-project`, emits
fingerprinted assets, and watches relevant project inputs. Without it, the
factory returns a null-project plugin suitable for development; production
hosts should require a real project.

This package uses Node filesystem APIs and is a build-time dependency. Do not
import it into browser runtime code.

## Development

```bash
pnpm --filter @mmx/build-tools test
pnpm --filter @mmx/build-tools build
```
