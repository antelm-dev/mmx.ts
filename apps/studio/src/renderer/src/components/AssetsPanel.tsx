import type { ReactElement } from "react";
import { panel } from "../ui.js";

/** Placeholder asset browser. A movable dock panel (see {@link ProblemsPanel}). */
export function AssetsPanel(): ReactElement {
  return (
    <div className={panel}>
      <div className="flex items-center justify-center flex-col gap-[7px] h-full text-fg-3 text-[11.5px] text-center p-3">
        <span className="text-[#55647b]" style={{ fontSize: 22 }}>
          ▧
        </span>
        <span>Asset browser coming soon</span>
      </div>
    </div>
  );
}
