import { ChakraProvider } from "@chakra-ui/react";
import type { PropsWithChildren } from "react";
import { studioSystem } from "./system.js";

export function StudioProvider({ children }: PropsWithChildren) {
  return <ChakraProvider value={studioSystem}>{children}</ChakraProvider>;
}
