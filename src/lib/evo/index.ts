import type { EvoAdapter } from "./adapter";
import { ManualEvoAdapter } from "./manual-adapter";
import { HttpEvoAdapter } from "./http-adapter";
import { ActiveClientsEvoAdapter } from "./active-clients-adapter";

export function evoAdapter(): EvoAdapter {
  const mode = process.env.EVO_INTEGRATION_MODE || "manual";
  if (mode === "manual") return new ManualEvoAdapter();
  if (process.env.EVO_ACTIVE_CLIENTS_PATH?.trim()) return new ActiveClientsEvoAdapter();
  return new HttpEvoAdapter();
}
