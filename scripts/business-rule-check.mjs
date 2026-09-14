function round(value){ return Math.round((value + Number.EPSILON) * 100) / 100; }
function monthsUsedInclusive(start, at){
  const a=new Date(start), b=new Date(at);
  if(b<a)return 0;
  const diff=(b.getUTCFullYear()-a.getUTCFullYear())*12+(b.getUTCMonth()-a.getUTCMonth());
  return Math.min(12,Math.max(1,diff+1));
}
function annual(total,start,at){
  const monthsUsed=monthsUsedInclusive(start,at);
  const monthsRemaining=Math.max(0,12-monthsUsed);
  const monthlyReference=round(total/12);
  const unusedBalance=round(monthlyReference*monthsRemaining);
  const advanceDeduction=round(total*0.144);
  const contractFee=round(total*0.10);
  const estimatedRefund=round(Math.max(0,unusedBalance-advanceDeduction-contractFee));
  return {monthsUsed,monthsRemaining,monthlyReference,unusedBalance,advanceDeduction,contractFee,estimatedRefund};
}
function recurringFee(start,at){
  const anniversary=new Date(start); anniversary.setUTCFullYear(anniversary.getUTCFullYear()+1);
  return new Date(at)<anniversary?258:0;
}
function assertEqual(actual,expected,label){if(actual!==expected)throw new Error(`${label}: esperado ${expected}, recebido ${actual}`)}

const example=annual(1200,"2025-12-30T00:00:00.000Z","2026-09-13T00:00:00.000Z");
assertEqual(example.monthsUsed,10,"meses utilizados");
assertEqual(example.monthsRemaining,2,"meses restantes");
assertEqual(example.monthlyReference,100,"mensalidade de referência");
assertEqual(example.unusedBalance,200,"saldo restante");
assertEqual(example.advanceDeduction,172.8,"14,4% do total");
assertEqual(example.contractFee,120,"10% do total");
assertEqual(example.estimatedRefund,0,"estorno final");
assertEqual(recurringFee("2025-12-30T00:00:00.000Z","2026-09-13T00:00:00.000Z"),258,"taxa recorrente antes de 12 meses");
assertEqual(recurringFee("2025-12-30T00:00:00.000Z","2026-12-30T00:00:00.000Z"),0,"taxa recorrente com 12 meses");
console.log("Business rule check passed.");
console.log(JSON.stringify(example,null,2));
