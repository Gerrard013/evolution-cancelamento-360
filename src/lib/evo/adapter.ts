import type { EvoCancelResult, EvoContract, EvoCustomer } from "./types";

export interface EvoAdapter {
  findCustomerById(memberId: string): Promise<EvoCustomer | null>;
  listContracts(customerExternalId: string): Promise<EvoContract[]>;
  getContract(contractExternalId: string): Promise<EvoContract | null>;
  cancelContract(contractExternalId: string, protocol: string): Promise<EvoCancelResult>;
}
