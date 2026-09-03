export type EvoCustomer = {
  externalId: string;
  name: string;
  contactHint?: string;
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
};

export type EvoCancelResult = {
  operationId?: string;
  status: "cancelled" | "accepted";
  rawStatus?: string;
};
