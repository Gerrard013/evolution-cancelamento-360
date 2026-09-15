import type { EvoCancelResult, EvoContract, EvoCustomer, EvoInvoice, EvoPaymentMethodResult } from "./types";

export interface EvoAdapter {
  findCustomerById(memberId: string): Promise<EvoCustomer | null>;
  findCustomerByCpf(cpf: string): Promise<EvoCustomer | null>;
  listContracts(customerExternalId: string): Promise<EvoContract[]>;
  getContract(contractExternalId: string): Promise<EvoContract | null>;
  listInvoices(customerExternalId: string): Promise<EvoInvoice[]>;
  cancelContract(contractExternalId: string, protocol: string): Promise<EvoCancelResult>;
  removeStoredPaymentMethod(contractExternalId: string, customerExternalId: string, protocol: string): Promise<EvoPaymentMethodResult>;
}
