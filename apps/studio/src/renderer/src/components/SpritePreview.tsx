import { useMemo } from "react";
import { previewForDefinition } from "../core/spritePreview.js";
import { cx } from "../ui.js";

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
        className={cx(
          "grid place-items-center flex-none overflow-hidden rounded-md bg-raised shadow-[0_0_0_1px_rgba(255,255,255,0.08)]",
          flip && "-scale-x-100",
        )}
        style={{ width: size, height: size }}
        title={definitionId}
      >
        <span
          className="relative overflow-hidden flex-none [image-rendering:pixelated]"
          style={{ width: rw, height: rh, transform: `scale(${scale})` }}
        >
          <img
            className="absolute max-w-none [image-rendering:pixelated] pointer-events-none"
            src={preview.url}
            style={{ left: -rx, top: -ry }}
            alt=""
            draggable={false}
          />
        </span>
      </span>
    );
  }

  if (fallbackColor) {
    return (
      <span
        className="block flex-none rounded-md shadow-[0_0_0_1px_rgba(255,255,255,0.15)]"
        style={{ width: size, height: size, background: fallbackColor }}
      />
    );
  }
  return null;
}
