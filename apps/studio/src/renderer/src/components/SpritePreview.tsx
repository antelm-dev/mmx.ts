import { useMemo } from "react";
import { previewForDefinition } from "../core/spritePreview.js";

interface Props {
  definitionId: string;
  size?: number;
  flip?: boolean;
  fallbackColor?: string | null;
}

/**
 * Renders the idle sprite crop for a definition, or a coloured swatch fallback
 * when it has no game sprite. A CSS `transform: scale` fits the crop into the
 * requested box while preserving nearest-neighbour pixels.
 */
export function SpritePreview({ definitionId, size = 48, flip = false, fallbackColor }: Props) {
  const preview = useMemo(() => previewForDefinition(definitionId), [definitionId]);

  if (preview) {
    const [rx, ry, rw, rh] = preview.region;
    const scale = Math.min(size / rw, size / rh);
    return (
      <span
        className={`sprite-frame${flip ? " flip" : ""}`}
        style={{ width: size, height: size }}
        title={definitionId}
      >
        <span
          className="sprite-crop"
          style={{ width: rw, height: rh, transform: `scale(${scale})` }}
        >
          <img src={preview.url} style={{ left: -rx, top: -ry }} alt="" draggable={false} />
        </span>
      </span>
    );
  }

  if (fallbackColor) {
    return (
      <span
        className="sprite-swatch"
        style={{ width: size, height: size, background: fallbackColor }}
      />
    );
  }
  return null;
}
