import { editor, useEditorSnapshot, useProjectSession } from "../app/useEditor.js";
import { availableParts, partName, placingPart } from "../core/recentParts.js";
import { useUiStore } from "../store/uiStore.js";
import { OverlayButton, OverlayCard } from "../ui/editor/overlay.js";
import { PartIcon, PartWheel } from "./PartWheel.js";
import { Tooltip } from "./Tooltip.js";

/**
 * The last parts placed (top slot of C-OVERLAY), newest first; a click or keys 1 to 8 pick
 * the place tool. Empty, it draws nothing, so the canvas looks the same at launch. It also
 * hosts the Q {@link PartWheel}, portalled out of the slot's clip.
 */
export function RecentPartsBar() {
  const recent = useUiStore((s) => s.recentParts);
  const snap = useEditorSnapshot();
  // Read fresh on every render, like keys 1 to 8: a part whose definition is gone (another
  // project, a deleted or undone enemy) drops out. The session hook re-renders on those edits.
  useProjectSession();
  const parts = availableParts(recent);
  const active = placingPart(snap.state);

  return (
    <>
      {parts.length > 0 && (
        <OverlayCard
          role="toolbar"
          aria-label="Recent parts"
          display="flex"
          gap="1"
          p="1"
          pointerEvents="auto"
        >
          {parts.map((part, i) => {
            const name = partName(part)!;
            const isActive = active?.kind === part.kind && active.id === part.id;
            return (
              <Tooltip key={`${part.kind}:${part.id}`} label={`${name}  ·  ${i + 1}`}>
                <OverlayButton
                  w="9"
                  h="9"
                  active={isActive}
                  aria-label={`Place ${name}`}
                  aria-pressed={isActive}
                  // A mouse click leaves focus where it was, so Space (pan) cannot re-click the slot.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => editor.pickRecentPart(i)}
                >
                  <PartIcon part={part} size={26} />
                </OverlayButton>
              </Tooltip>
            );
          })}
        </OverlayCard>
      )}
      <PartWheel />
    </>
  );
}
