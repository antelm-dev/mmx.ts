import { useMemo } from "react";
import { previewForDecoration, previewForDefinition } from "../core/spritePreview.js";
import { cx } from "../ui.js";

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
  const preview = useMemo(
    () =>
      assetId
        ? previewForDecoration(assetId)
        : definitionId
          ? previewForDefinition(definitionId)
          : null,
    [definitionId, assetId],
  );

  if (preview) {
    const [rx, ry, rw, rh] = preview.region;
    const scale = Math.min(size / rw, size / rh);
    return (
      <span
        className={cx(
          "grid place-items-center flex-none overflow-hidden rounded-md bg-raised ring-1 ring-border",
          flip && "-scale-x-100",
        )}
        style={{ width: size, height: size }}
        title={assetId ?? definitionId}
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
        className="block flex-none rounded-md ring-1 ring-border"
        style={{ width: size, height: size, background: fallbackColor }}
      />
    );
  }
  return null;
}
