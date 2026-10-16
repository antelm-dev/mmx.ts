import { useMemo } from "react";
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
      transform: "translate(-50%, -50%)",
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
 */
export function ProblemBadges() {
  const snap = useEditorSnapshot();
  const toScreen = useWorldToScreen();
  const { document } = snap.state;
  const anchors = useMemo(
    () => problemAnchors(document, snap.validation.issues),
    [document, snap.validation.issues],
  );

  return anchors.map((anchor) => {
    const { x, y } = toScreen(anchor.target.x, anchor.target.y);
    const messages = anchor.issues.map((issue) => issue.message);
    const count = messages.length;
    return (
      <Tooltip key={anchor.key} label={messages.join("\n")}>
        <Badge
          // Inline px: a class per pan/zoom position would bloat the style sheet.
          style={{ left: x, top: y }}
          bg={anchor.severity === "error" ? "studio.danger" : "studio.warning"}
          aria-label={`${count} ${count === 1 ? anchor.severity : "problems"}: ${messages.join(" ")}`}
          data-testid="problem-badge"
          data-severity={anchor.severity}
          // A mouse click leaves focus where it was, so Space (pan) cannot re-click the badge.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.focusProblem(anchor.issues[0]!)}
        >
          {count > 1 ? count : "!"}
        </Badge>
      </Tooltip>
    );
  });
}
