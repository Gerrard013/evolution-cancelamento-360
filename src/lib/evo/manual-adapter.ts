import type { EvoAdapter } from "./adapter";

export class ManualEvoAdapter implements EvoAdapter {
  async findCustomerById() { return null; }
  async findCustomerByCpf() { return null; }
  async listContracts() { return []; }
  async getContract() { return null; }
  async listInvoices() { return []; }
  async cancelContract(): Promise<never> { throw new Error("EVO_WRITE_DISABLED"); }
  async removeStoredPaymentMethod(): Promise<never> { throw new Error("EVO_PAYMENT_METHOD_WRITE_DISABLED"); }
}
