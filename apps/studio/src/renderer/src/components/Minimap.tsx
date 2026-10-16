import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { chakra } from "@chakra-ui/react";
import { definitionFor, instanceSize } from "@mmx/content-schema";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { minimapLayout, minimapViewRect, terrainPixels } from "../core/minimap.js";
import { useUiStore } from "../store/uiStore.js";
import { OverlayCard } from "../ui/editor/overlay.js";

const MARKED = new Set(["camera", "spawn", "enemy"]);

/**
 * The level in a strip (bottom slot of C-OVERLAY): terrain, camera rectangles, Spawn and enemy
 * dots and the current view. Click or drag centres the view there. View → Minimap hides it.
 */
export function Minimap() {
  return useUiStore((s) => s.minimapVisible) ? <MinimapStrip /> : null;
}

function MinimapStrip() {
  const { document: doc, zoom, viewportPosition } = useEditorSnapshot().state;
  const layout = minimapLayout(doc);
  const terrain = useRef<HTMLCanvasElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });

  // Repaint the terrain only when the tiles change (an edit, another level), not on pan or zoom.
  useLayoutEffect(() => {
    terrain
      .current!.getContext("2d")!
      .putImageData(new ImageData(terrainPixels(doc), doc.cols, doc.rows), 0, 0);
  }, [doc.tiles, doc.cols, doc.rows]);

  // The viewport host (the slot's parent) is the view: EditorViewport sizes its canvas to it.
  useLayoutEffect(() => {
    const host = card.current!.parentElement!.parentElement!;
    const observer = new ResizeObserver(() =>
      setViewSize({ w: host.clientWidth, h: host.clientHeight }),
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const marks = useMemo(
    () =>
      doc.objects
        .map((inst) => ({ inst, def: definitionFor(inst.definitionId), ...instanceSize(inst) }))
        .filter((m) => MARKED.has(m.def.category)),
    [doc.objects],
  );

  const view = minimapViewRect(layout, zoom, viewportPosition, viewSize);

  const centre = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max(e.clientX - box.left, 0), layout.width);
    const y = Math.min(Math.max(e.clientY - box.top, 0), layout.height);
    editor.centerOn(x / layout.sx, y / layout.sy);
  };

  return (
    <OverlayCard
      ref={card}
      p="1"
      rounded="lg"
      boxShadow="0 5px 18px rgba(0,0,0,0.28)"
      pointerEvents="auto"
      data-testid="minimap"
    >
      <chakra.div
        position="relative"
        cursor="pointer"
        touchAction="none"
        style={{ width: layout.width, height: layout.height }}
        aria-label="Minimap"
        role="img"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          centre(e);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) centre(e);
        }}
      >
        {/* Plain canvas: Chakra reads `width` / `height` as CSS, not the bitmap size. */}
        <canvas
          ref={terrain}
          width={doc.cols}
          height={doc.rows}
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            imageRendering: "pixelated",
          }}
        />
        <chakra.svg position="absolute" inset="0" w="full" h="full" overflow="hidden">
          {marks.map((m) =>
            m.def.category === "camera" ? (
              <rect
                key={m.inst.id}
                x={m.inst.x * layout.sx}
                y={m.inst.y * layout.sy}
                width={m.width * layout.sx}
                height={m.height * layout.sy}
                fill="none"
                stroke={m.def.editor.color}
                strokeOpacity={0.8}
              />
            ) : (
              <circle
                key={m.inst.id}
                cx={(m.inst.x + m.width / 2) * layout.sx}
                cy={(m.inst.y + m.height / 2) * layout.sy}
                r={2}
                fill={m.def.editor.color}
              />
            ),
          )}
          <rect
            x={view.x}
            y={view.y}
            width={view.w}
            height={view.h}
            fill="rgba(255,255,255,0.08)"
            stroke="#edf3fc"
            data-testid="minimap-view"
          />
        </chakra.svg>
      </chakra.div>
    </OverlayCard>
  );
}
