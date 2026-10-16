import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { Portal, chakra } from "@chakra-ui/react";
import { ChevronLeft, X } from "lucide-react";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  allDefinitions,
  getDefinition,
} from "@mmx/content-schema";
import { DECORATION_ASSETS } from "@mmx/renderer-pixi";
import { editor, useProjectSession } from "../app/useEditor.js";
import { partName, placeTool, type RecentPart } from "../core/recentParts.js";
import { useUiStore } from "../store/uiStore.js";
import { OverlayButton, OverlayCard } from "../ui/editor/overlay.js";
import { SpritePreview } from "./SpritePreview.js";
import { Tooltip } from "./Tooltip.js";

interface WheelGroup {
  key: string;
  label: string;
  parts: RecentPart[];
}

/** A part's sprite, or its editor colour when it has none. */
export function PartIcon({ part, size }: { part: RecentPart; size: number }) {
  return part.kind === "object" ? (
    <SpritePreview
      definitionId={part.id}
      size={size}
      fallbackColor={getDefinition(part.id)?.editor.color}
    />
  ) : (
    // A project without the decoration's sheet draws no preview: keep the slot visible.
    <SpritePreview assetId={part.id} size={size} fallbackColor="#7c8da7" />
  );
}

const close = () => useUiStore.getState().setPartWheelOpen(false);

/**
 * The Q part wheel: categories on a ring at the pointer, then the chosen category's parts; a
 * part picks its place tool. Arrows move between items, Enter picks, Escape or a click
 * outside closes. Tracks the pointer while mounted (Edit mode), so it opens where the mouse is.
 */
export function PartWheel() {
  const open = useUiStore((s) => s.partWheelOpen);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => (pointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      // Leaving Edit mode closes the wheel: it must not reopen on the way back.
      close();
    };
  }, []);
  return open ? <WheelMenu pointer={pointer.current} /> : null;
}

function WheelMenu({ pointer }: { pointer: { x: number; y: number } | null }) {
  const objects = useProjectSession().project?.manifest.objects;
  const groups = useMemo<WheelGroup[]>(
    () =>
      [
        ...CATEGORY_ORDER.filter((category) => category !== "unknown").map((category) => ({
          key: category,
          label: CATEGORY_LABELS[category] ?? category,
          parts: allDefinitions()
            .filter((d) => d.category === category)
            .map((d): RecentPart => ({ kind: "object", id: d.id })),
        })),
        {
          key: "decorations",
          label: "Decorations",
          parts: DECORATION_ASSETS.map((a): RecentPart => ({ kind: "decoration", id: a.id })),
        },
      ].filter((g) => g.parts.length > 0),
    // `objects` changes whenever the project's definitions (read by allDefinitions) do.
    [objects],
  );
  const [group, setGroup] = useState<WheelGroup | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Centred on the pointer when it is over the level, else on the level; set once per opening.
  const [origin] = useState(() => {
    const rect = document.getElementById("viewport-canvas")?.getBoundingClientRect();
    const inside =
      pointer &&
      rect &&
      pointer.x >= rect.left &&
      pointer.x <= rect.right &&
      pointer.y >= rect.top &&
      pointer.y <= rect.bottom;
    if (inside || !rect) return pointer ?? { x: innerWidth / 2, y: innerHeight / 2 };
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  // Focus the first item on open and on each ring change; give focus back on close.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    return () => before?.focus?.();
  }, []);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-wheel-item]")?.focus();
  }, [group]);
  // Re-clamp to the window when it is resized while open.
  const [, relayout] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener("resize", relayout);
    return () => window.removeEventListener("resize", relayout);
  }, []);

  const items = group ? group.parts.length : groups.length;
  const itemSize = group ? 64 : 76;
  // shortcut: one ring that grows with its item count; split long categories into pages if one outgrows the window.
  const radius = Math.max(96, (items * (itemSize + 24)) / (2 * Math.PI));
  const reach = radius + itemSize / 2 + 12;
  const cx = Math.min(Math.max(origin.x, reach), Math.max(reach, innerWidth - reach));
  const cy = Math.min(Math.max(origin.y, reach), Math.max(reach, innerHeight - reach));
  const at = (i: number) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / items;
    return { left: reach + Math.cos(angle) * radius, top: reach + Math.sin(angle) * radius };
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // The wheel owns the keyboard while open: no editor shortcut acts behind it.
    e.stopPropagation();
    const buttons = [...ref.current!.querySelectorAll<HTMLElement>("[data-wheel-item]")];
    const i = buttons.indexOf(document.activeElement as HTMLElement);
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (step) {
      e.preventDefault();
      buttons[(i + step + buttons.length) % buttons.length]?.focus();
    } else if (e.key === "Escape" || e.key === "Tab" || e.code === "KeyQ") {
      e.preventDefault();
      close();
    } else if (e.key === "Backspace" && group) {
      setGroup(null);
    }
  };

  return (
    <Portal>
      <chakra.div
        position="fixed"
        inset="0"
        zIndex="popover"
        data-testid="part-wheel-backdrop"
        onPointerDown={close}
      />
      <chakra.div
        ref={ref}
        role="menu"
        aria-label={group ? `${group.label} parts` : "Part categories"}
        position="fixed"
        zIndex="popover"
        style={{ left: cx - reach, top: cy - reach, width: reach * 2, height: reach * 2 }}
        onKeyDown={onKeyDown}
      >
        <OverlayCard position="absolute" inset="1" rounded="full" />
        {group
          ? group.parts.map((part, i) => {
              const name = partName(part) ?? part.id;
              return (
                <Tooltip key={part.id} label={name}>
                  <WheelItem
                    role="menuitem"
                    data-wheel-item=""
                    style={at(i)}
                    w="64px"
                    h="12"
                    flexDirection="column"
                    gap="0.5"
                    fontSize="9px"
                    aria-label={`Place ${name}`}
                    onClick={() => {
                      editor.store.setTool(placeTool(part), part.id);
                      close();
                    }}
                  >
                    <PartIcon part={part} size={22} />
                    <chakra.span maxW="full" px="1" truncate>
                      {name}
                    </chakra.span>
                  </WheelItem>
                </Tooltip>
              );
            })
          : groups.map((g, i) => (
              <WheelItem
                key={g.key}
                role="menuitem"
                data-wheel-item=""
                // Named by its label alone: the icon's sprite title is not part of it.
                aria-label={g.label}
                style={at(i)}
                w="76px"
                h="12"
                flexDirection="column"
                gap="0.5"
                fontSize="10px"
                onClick={() => setGroup(g)}
              >
                <PartIcon part={g.parts[0]!} size={20} />
                {g.label}
              </WheelItem>
            ))}
        {/* Last, so arrows start on the ring and reach the centre at its end. */}
        <WheelItem
          role="menuitem"
          data-wheel-item=""
          style={{ left: reach, top: reach }}
          w="11"
          h="11"
          rounded="full"
          aria-label={group ? "Back to categories" : "Close part wheel"}
          onClick={() => (group ? setGroup(null) : close())}
        >
          {group ? <ChevronLeft size={18} /> : <X size={18} />}
        </WheelItem>
      </chakra.div>
    </Portal>
  );
}

const WheelItem = chakra(OverlayButton, {
  base: {
    position: "absolute",
    transform: "translate(-50%, -50%)",
    bg: "#161e2b",
    borderColor: "#3a4960",
    _focusVisible: { outline: "2px solid #4b8eff", outlineOffset: "1px" },
  },
});
