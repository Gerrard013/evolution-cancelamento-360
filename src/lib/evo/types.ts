export type EvoCustomer = {
  externalId: string;
  name: string;
  email?: string;
  document?: string;
  rg?: string;
  address?: string;
  contactHint?: string;
  birthDate?: string;
  phoneLast4?: string;
};

export type EvoContract = {
  externalId: string;
  customerExternalId: string;
  unit: string;
  planName: string;
  planType: string;
  startDate: string;
  endDate?: string;
  amountPaid: number;
  recurring: boolean;
  status: string;
  paymentMethodId?: string;
  hasStoredCard?: boolean;
};

export type EvoInvoice = {
  externalId?: string;
  customerExternalId?: string;
  contractExternalId?: string;
  dueDate?: string;
  amount: number;
  status: string;
  open: boolean;
};

export type EvoCancelResult = {
  operationId?: string;
  status: "cancelled" | "accepted";
  rawStatus?: string;
};

export type EvoPaymentMethodResult = {
  removed: boolean;
  operationId?: string;
};
