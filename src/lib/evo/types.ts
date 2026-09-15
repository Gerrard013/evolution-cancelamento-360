export type EvoCustomer = {
  externalId: string;
  name: string;
  contactHint?: string;
  birthDate?: string;
  phoneLast4?: string;
  email?: string;
  cpf?: string;
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

export type EvoCancelResult = {
  operationId?: string;
  status: "cancelled" | "accepted";
  rawStatus?: string;
};

export type EvoPaymentMethodResult = {
  removed: boolean;
  operationId?: string;
};
