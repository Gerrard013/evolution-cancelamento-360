import type { EvoAdapter } from "./adapter";
import { ManualEvoAdapter } from "./manual-adapter";
import { HttpEvoAdapter } from "./http-adapter";

export function evoAdapter(): EvoAdapter {
  const mode = process.env.EVO_INTEGRATION_MODE || "manual";
  return mode === "manual" ? new ManualEvoAdapter() : new HttpEvoAdapter();
}
