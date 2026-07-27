/// <reference types="vite/client" />

declare module "virtual:mmx-project" {
  import type { BrowserProjectBundle } from "@mmx/build-tools";
  const bundle: BrowserProjectBundle | null;
  export default bundle;
}
