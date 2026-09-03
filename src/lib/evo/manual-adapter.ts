import type { EvoAdapter } from "./adapter";

export class ManualEvoAdapter implements EvoAdapter {
  async findCustomerById() { return null; }
  async listContracts() { return []; }
  async getContract() { return null; }
  async cancelContract(): Promise<never> {
    throw new Error("EVO_WRITE_DISABLED");
  }
}
