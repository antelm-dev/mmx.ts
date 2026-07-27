/// <reference types="vite/client" />

declare module "virtual:mmx-project" {
  import type { BrowserProjectBundle } from "@mmx/build-tools";
  const bundle: BrowserProjectBundle;
  export default bundle;
}
