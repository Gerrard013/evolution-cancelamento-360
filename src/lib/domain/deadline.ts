export function addBusinessDays(start: Date, businessDays: number): Date {
  const total = Math.max(0, Math.floor(businessDays));
  const result = new Date(start);
  let added = 0;
  while (added < total) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

export function refundDeadlineFrom(start: Date): Date {
  const configured = Number(process.env.REFUND_DEADLINE_BUSINESS_DAYS || 60);
  const days = Number.isFinite(configured) ? Math.max(1, Math.min(120, Math.floor(configured))) : 60;
  return addBusinessDays(start, days);
}
