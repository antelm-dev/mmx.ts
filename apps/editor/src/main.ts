import "./styles.scss";
import { provideZonelessChangeDetection } from "@angular/core";
import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app/app.component.js";

/**
 * MMX Studio bootstrap. Standalone, zoneless Angular + Material. All editor state
 * lives in {@link EditorService}; the components are thin, signal-driven views.
 *
 * No animations provider: Angular Material 22 uses CSS-based animations and works
 * without the (now-deprecated) `provideAnimations*` DI, which keeps the bootstrap
 * on the modern, warning-free path.
 */
bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()],
}).catch((error) => console.error(error));
