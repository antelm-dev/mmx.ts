# @mmx/contracts

Small, dependency-free serialized contracts shared by authoring, engine, and
renderer packages. There is intentionally no root import; consumers select the
contract they need.

## Entry points

| Import                     | Exports                                                             |
| -------------------------- | ------------------------------------------------------------------- |
| `@mmx/contracts/animation` | Animation regions, frames, clips, documents, and runtime assertions |
| `@mmx/contracts/terrain`   | Stable terrain tile values and slope map/profile types              |

```ts
import { assertAnimData, type AnimData } from "@mmx/contracts/animation";
import { TerrainTile } from "@mmx/contracts/terrain";

assertAnimData(rawAnimation);
const solid = TerrainTile.Solid;
```

Use `assertAnimData` and `assertRegion` at untyped data boundaries. The terrain
values are serialization contracts; change them only with a coordinated schema
and migration update.

## Development

```bash
pnpm --filter @mmx/contracts test
pnpm --filter @mmx/contracts build
```
