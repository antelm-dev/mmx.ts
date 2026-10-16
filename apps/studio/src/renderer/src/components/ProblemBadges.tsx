import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { chakra } from "@chakra-ui/react";
import { editor, useEditorSnapshot } from "../app/useEditor.js";
import { problemAnchors } from "../core/problemAnchors.js";
import { Tooltip } from "./Tooltip.js";
import { useWorldToScreen } from "./viewportOverlay.js";

const Badge = chakra(
  "button",
  {
    base: {
      position: "absolute",
      // Hangs below the corner: the object's name label sits just above it.
      transform: "translateX(-50%)",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minW: "4",
      h: "4",
      px: "1",
      rounded: "full",
      border: "1.5px solid rgba(4,6,10,0.85)",
      color: "#0b0f17",
      fontSize: "10px",
      fontWeight: "bold",
      lineHeight: "1",
      cursor: "pointer",
      pointerEvents: "auto",
      _focusVisible: { outline: "2px solid #4b8eff", outlineOffset: "1px" },
    },
  },
  { defaultProps: { type: "button" } },
);

/**
 * One badge per level element with validation problems (canvas slot of C-OVERLAY), at the
 * element's top-right corner or the engine diagnostic's position; clicking selects and frames it.
 * Badges outside the view leave the Tab order.
 */
export function ProblemBadges() {
  const snap = useEditorSnapshot();
  const toScreen = useWorldToScreen();
  const { document } = snap.state;
  const anchors = useMemo(
    () => problemAnchors(document, snap.validation.issues),
    [document, snap.validation.issues],
  );
  const frame = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = frame.current!;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <chakra.div ref={frame} position="absolute" inset="0">
      {anchors.map((anchor) => {
        const { x, y } = toScreen(anchor.target.x, anchor.target.y);
        const messages = anchor.issues.map((issue) => issue.message);
        const count = messages.length;
        const inView = x >= 0 && y >= 0 && x <= size.w && y <= size.h;
        return (
          <Tooltip key={anchor.key} label={messages.join("\n")}>
            <Badge
              // Inline px: a class per pan/zoom position would bloat the style sheet.
              style={{ left: x, top: y }}
              tabIndex={inView ? undefined : -1}
              bg={anchor.severity === "error" ? "studio.danger" : "studio.warning"}
              aria-label={`${count} ${count === 1 ? anchor.severity : "problems"}: ${messages.join(" ")}`}
              data-testid="problem-badge"
              data-anchor={anchor.key}
              data-severity={anchor.severity}
              // A mouse click leaves focus where it was, so Space (pan) cannot re-click the badge.
              onMouseDown={(e) => e.preventDefault()}
              // Space pans the view; only Enter activates a focused badge.
              onKeyDown={(e) => e.key === " " && e.preventDefault()}
              onKeyUp={(e) => e.key === " " && e.preventDefault()}
              onClick={() => editor.focusProblem(anchor.issues[0]!)}
            >
              {count > 1 ? count : "!"}
            </Badge>
          </Tooltip>
        );
      })}
    </chakra.div>
  );
}
