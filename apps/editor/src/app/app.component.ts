import { Component, inject } from "@angular/core";
import { DockviewAngularComponent, type DockviewReadyEvent } from "dockview-angular";
import { EditorService } from "./editor.service.js";
import { ToolbarComponent } from "./toolbar.component.js";
import { LeftSidebarComponent } from "./left-sidebar.component.js";
import { ViewportComponent } from "./viewport.component.js";
import { InspectorComponent } from "./inspector.component.js";
import { BottomPanelComponent } from "./bottom-panel.component.js";

/** Root layout: a fixed command toolbar above a user-configurable Dockview workspace. */
@Component({
  selector: "mmx-root",
  imports: [ToolbarComponent, DockviewAngularComponent],
  host: { "(window:keydown)": "onKey($event)" },
  template: `
    <div class="shell">
      <mmx-toolbar />
      <main class="workspace dockview-theme-dark">
        <dv-dockview
          [components]="dockComponents"
          [tabHeight]="32"
          [floatingGroupBounds]="'boundedWithinViewport'"
          (ready)="onDockReady($event)"
        />
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        width: 100vw;
      }
      .shell {
        display: grid;
        grid-template-rows: 56px minmax(0, 1fr);
        height: 100%;
        width: 100%;
      }
      .workspace {
        min-height: 0;
        min-width: 0;
        overflow: hidden;
        background: #0d1017;
      }
      dv-dockview {
        height: 100%;
        width: 100%;
      }
    `,
  ],
})
export class AppComponent {
  private readonly service = inject(EditorService);

  readonly dockComponents = {
    palette: LeftSidebarComponent,
    viewport: ViewportComponent,
    inspector: InspectorComponent,
    bottom: BottomPanelComponent,
  };

  onKey(event: KeyboardEvent): void {
    this.service.handleKeydown(event);
  }

  onDockReady({ api }: DockviewReadyEvent): void {
    const viewport = api.addPanel({
      id: "viewport",
      component: "viewport",
      title: "Level",
      renderer: "always",
      minimumWidth: 320,
      minimumHeight: 240,
    });

    const palette = api.addPanel({
      id: "palette",
      component: "palette",
      title: "Objects",
      initialWidth: 264,
      minimumWidth: 220,
      maximumWidth: 300,
      position: { referencePanel: viewport, direction: "left" },
    });

    const inspector = api.addPanel({
      id: "inspector",
      component: "inspector",
      title: "Inspector",
      initialWidth: 292,
      minimumWidth: 260,
      maximumWidth: 360,
      position: { referencePanel: viewport, direction: "right" },
    });

    const bottom = api.addPanel({
      id: "bottom",
      component: "bottom",
      title: "Project details",
      initialHeight: 176,
      minimumHeight: 132,
      maximumHeight: 220,
      position: { referencePanel: viewport, direction: "below" },
    });

    requestAnimationFrame(() => {
      bottom.api.setSize({ height: 176 });
      inspector.api.setSize({ width: 292 });
      palette.api.setSize({ width: 264 });
    });

    viewport.api.setActive();
  }
}
