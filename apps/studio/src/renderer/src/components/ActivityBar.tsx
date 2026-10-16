import { chakra } from "@chakra-ui/react";
import { CircleAlert, FolderTree, Shapes, ListTree, type LucideIcon } from "lucide-react";
import { openPanel, PANELS, useVisiblePanelIds } from "../app/dock.js";
import { ToolbarButton } from "../ui/editor/toolbar-button.js";
import { Tooltip } from "./Tooltip.js";

/** `PanelSpec.activity.icon` names; an unknown name falls back to the label's initial. */
const ICONS: Record<string, LucideIcon> = {
  objects: Shapes,
  assets: FolderTree,
  scene: ListTree,
  problems: CircleAlert,
};

const VIEWS = PANELS.filter((p) => p.activity).sort(
  (a, b) => a.activity!.order - b.activity!.order,
);

/** Fixed column left of the workspace: one button per side view, opening or surfacing it. */
export function ActivityBar() {
  const visible = useVisiblePanelIds();
  return (
    <chakra.nav
      aria-label="Activity bar"
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap="1"
      py="1.5"
      bg="studio.chrome"
      borderRight="1px solid"
      borderColor="studio.border"
    >
      {VIEWS.map((spec) => {
        const { label, icon } = spec.activity!;
        const Icon = ICONS[icon];
        return (
          <Tooltip key={spec.id} label={label}>
            <ToolbarButton
              icon
              active={visible.includes(spec.id)}
              aria-label={label}
              onClick={() => openPanel(spec)}
            >
              {Icon ? <Icon size={16} /> : label.charAt(0)}
            </ToolbarButton>
          </Tooltip>
        );
      })}
    </chakra.nav>
  );
}
