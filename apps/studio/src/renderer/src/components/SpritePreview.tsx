import { useMemo } from "react";
import { chakra } from "@chakra-ui/react";
import { getDefinition } from "@mmx/content-schema";
import {
  getDecorationPreview,
  getSpritePreview,
} from "@mmx/renderer-pixi";
import { starterAssets } from "../assets/studioAssets.js";
import { projectSession, useProjectSession } from "../app/useEditor.js";

const ring = "0 0 0 1px {colors.studio.border}";

interface Props {
  definitionId?: string;
  assetId?: string;
  size?: number;
  flip?: boolean;
  fallbackColor?: string | null;
}

export function SpritePreview({
  definitionId,
  assetId,
  size = 48,
  flip = false,
  fallbackColor,
}: Props) {
  // The open project's sprites (its enemies are drawn from its animation assets).
  const gameData = useProjectSession().project?.gameData;
  const catalog = (projectSession.loadedAssets() ?? starterAssets).catalog;
  const preview = useMemo(() => {
    if (assetId) return getDecorationPreview(assetId, catalog);
    if (!definitionId) return null;
    const def = getDefinition(definitionId);
    return def ? getSpritePreview(def, catalog) : null;
  }, [definitionId, assetId, catalog, gameData]);

  if (preview) {
    const [rx, ry, rw, rh] = preview.region;
    const scale = Math.min(size / rw, size / rh);
    return (
      <chakra.span
        display="block"
        position="relative"
        flex="none"
        overflow="hidden"
        rounded="md"
        bg="studio.raised"
        boxShadow={ring}
        style={{ width: size, height: size, transform: flip ? "scaleX(-1)" : undefined }}
        title={assetId ?? definitionId}
      >
        {/* Centred by offset, not grid: a grid track grows to the unscaled region, pushing a region larger than `size` out of the box. */}
        <chakra.span
          position="absolute"
          overflow="hidden"
          imageRendering="pixelated"
          style={{ left: (size - rw) / 2, top: (size - rh) / 2, width: rw, height: rh, transform: `scale(${scale})` }}
        >
          <chakra.img
            position="absolute"
            maxW="none"
            imageRendering="pixelated"
            pointerEvents="none"
            src={preview.imageUrl}
            style={{ left: -rx, top: -ry }}
            alt=""
            draggable={false}
          />
        </chakra.span>
      </chakra.span>
    );
  }

  if (fallbackColor) {
    return (
      <chakra.span
        display="block"
        flex="none"
        rounded="md"
        boxShadow={ring}
        style={{ width: size, height: size, background: fallbackColor }}
      />
    );
  }
  return null;
}
