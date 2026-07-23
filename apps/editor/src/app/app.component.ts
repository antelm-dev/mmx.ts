import { Component, inject } from "@angular/core";
import { EditorService } from "./editor.service.js";
import { ToolbarComponent } from "./toolbar.component.js";
import { LeftSidebarComponent } from "./left-sidebar.component.js";
import { ViewportComponent } from "./viewport.component.js";
import { InspectorComponent } from "./inspector.component.js";
import { BottomPanelComponent } from "./bottom-panel.component.js";

/** Root layout: the classic level-editor dock (toolbar / left / center / right / bottom). */
@Component({
  selector: "mmx-root",
  imports: [
    ToolbarComponent,
    LeftSidebarComponent,
    ViewportComponent,
    InspectorComponent,
    BottomPanelComponent,
  ],
  host: { "(window:keydown)": "onKey($event)" },
  template: `
    <div class="grid">
      <mmx-toolbar class="a-toolbar" />
      <mmx-left-sidebar class="a-left" />
      <mmx-viewport class="a-center" />
      <mmx-inspector class="a-right" />
      <mmx-bottom-panel class="a-bottom" />
    </div>
  `,
  styles: [
    `
      .grid {
        display: grid;
        grid-template-areas:
          "toolbar toolbar toolbar"
          "left center right"
          "bottom bottom bottom";
        grid-template-rows: 52px 1fr 190px;
        grid-template-columns: 250px 1fr 320px;
        height: 100vh;
        width: 100vw;
      }
      .a-toolbar {
        grid-area: toolbar;
      }
      .a-left {
        grid-area: left;
        min-height: 0;
        overflow: hidden;
      }
      .a-center {
        grid-area: center;
        min-width: 0;
        min-height: 0;
      }
      .a-right {
        grid-area: right;
        min-height: 0;
        overflow: hidden;
      }
      .a-bottom {
        grid-area: bottom;
        min-height: 0;
      }
    `,
  ],
})
export class AppComponent {
  private readonly service = inject(EditorService);

  onKey(event: KeyboardEvent): void {
    this.service.handleKeydown(event);
  }
}
