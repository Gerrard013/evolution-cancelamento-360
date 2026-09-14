import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CancellationRequest, Contract, Customer, RefundCalculation } from "@prisma/client";
import { decryptText } from "@/lib/security/crypto";

type TermData = { request: CancellationRequest; contract: Contract; customer: Customer; calculation?: RefundCalculation | null };

function wrap(text: string, max = 92) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = []; let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) { if (line) lines.push(line); line = word; }
    else line = (line + " " + word).trim();
  }
  if (line) lines.push(line); return lines;
}

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function memoryNumber(memory: unknown, key: string) {
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) return undefined;
  const value = (memory as Record<string, unknown>)[key];
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function buildCancellationTerm({ request, contract, customer, calculation }: TermData) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.08,0.1,0.12), green = rgb(0.13,0.55,0.22), muted = rgb(0.35,0.4,0.43);
  let y = 790;
  const draw=(txt:string,size=10,font=regular,color=black,x=52)=>{page.drawText(txt,{x,y,size,font,color});y-=size+7};
  const paragraph=(txt:string,size=9.5)=>{for(const line of wrap(txt,98))draw(line,size);y-=4};
  const field=(label:string,value:string)=>{draw(label,8.5,bold,muted);draw(value||"Não informado",11,regular,black);y-=3};

  page.drawRectangle({x:0,y:810,width:595.28,height:31.89,color:rgb(0.03,0.12,0.08)});
  page.drawText("EVOLUTION ACADEMIA • CANAL OFICIAL DE CANCELAMENTO",{x:52,y:821,size:10,font:bold,color:rgb(0.82,1,0.84)});
  y=784;
  draw(contract.recurring?"PEDIDO DE CANCELAMENTO — PLANO RECORRENTE":"PEDIDO DE CANCELAMENTO — PLANO ANUAL",16,bold,green);
  draw(`Protocolo: ${request.protocol}`,9,bold,muted);y-=8;

  field("ALUNO",customer.displayName);
  let memberId="Identificador confirmado"; try{if(customer.externalIdCiphertext)memberId=decryptText(customer.externalIdCiphertext)}catch{}
  field("MATRÍCULA / ID EVO",memberId);
  field("UNIDADE",contract.unit);
  field("PLANO",contract.planName);
  field("INÍCIO DO CONTRATO",contract.startDate.toLocaleDateString("pt-BR"));
  field("DATA DA SOLICITAÇÃO",request.createdAt.toLocaleDateString("pt-BR"));
  field("ENDEREÇO",request.requesterAddress||"Não informado");

  draw("SOLICITAÇÃO",10,bold,green);y-=2;
  paragraph("Solicito o cancelamento do meu contrato com a EVOLUTION ACADEMIA e declaro estar ciente das condições aplicáveis ao meu plano e dos valores apresentados neste portal antes da emissão deste termo.");
  field("MOTIVO",`${request.reasonCode}${request.reasonDetails?` — ${request.reasonDetails}`:""}`);

  draw("CONDIÇÕES E VALORES",10,bold,green);y-=2;
  if(contract.recurring){
    if(Number(request.cancellationFee)>0) {
      paragraph(`Plano recorrente sem estorno. Como o pedido ocorre antes de completar 12 meses de contrato, a taxa de cancelamento é de ${brl(Number(request.cancellationFee))}. Após a confirmação do pagamento, o contrato seguirá para cancelamento e a forma de pagamento recorrente será removida conforme a integração disponível no EVO/W12.`);
    } else {
      paragraph("Plano recorrente sem estorno. O contrato já completou 12 meses e não há taxa de cancelamento antecipado. O contrato seguirá para cancelamento e a forma de pagamento recorrente será removida conforme a integração disponível no EVO/W12.");
    }
  }else if(calculation){
    const monthsUsed=memoryNumber(calculation.memory,"monthsUsed");
    const monthsRemaining=memoryNumber(calculation.memory,"monthsRemaining");
    const monthlyReference=memoryNumber(calculation.memory,"monthlyReference") ?? Number(calculation.eligibleBase)/12;
    const advanceDeduction=memoryNumber(calculation.memory,"advanceDeduction") ?? Number(calculation.eligibleBase)*0.144;
    const contractFee=memoryNumber(calculation.memory,"contractFee") ?? Number(calculation.eligibleBase)*0.10;
    field("VALOR TOTAL DO PLANO",brl(Number(calculation.eligibleBase)));
    field("VALOR MENSAL DE REFERÊNCIA",brl(monthlyReference));
    if(monthsUsed!==undefined)field("MESES UTILIZADOS",String(monthsUsed));
    if(monthsRemaining!==undefined)field("MESES RESTANTES",String(monthsRemaining));
    field("SALDO DOS MESES RESTANTES",brl(Number(calculation.unusedBalance)));
    field("DESCONTO DE 14,4% SOBRE O VALOR TOTAL",`- ${brl(advanceDeduction)}`);
    field("DESCONTO DE 10% SOBRE O VALOR TOTAL",`- ${brl(contractFee)}`);
    field("ESTORNO PREVISTO",brl(Number(calculation.estimatedRefund)));
    if(Number(calculation.estimatedRefund)>0 && request.pixKey) field("CHAVE PIX PARA RECEBIMENTO",request.pixKey);
    paragraph("Fórmula: (valor total ÷ 12 × meses restantes) − 14,4% do valor total − 10% do valor total. O resultado mínimo é R$ 0,00. Quando houver estorno, o pagamento seguirá o prazo operacional previsto no termo vigente.");
  }else{
    paragraph("Plano anual: o sistema apresentará os valores conforme os dados do contrato registrados no EVO/W12.");
  }

  paragraph("Esta solicitação é registrada neste portal e vinculada ao protocolo acima. Este portal substitui o envio do pedido por e-mail no fluxo digital de cancelamento adotado pela Evolution Academia.");

  y-=8;draw("ASSINATURA DO ALUNO",9,bold,muted);
  page.drawLine({start:{x:52,y:y-24},end:{x:350,y:y-24},thickness:0.8,color:muted});
  page.drawText("Assine e envie este documento pelo próprio portal",{x:52,y:y-39,size:8.5,font:regular,color:muted});
  page.drawText(`Belém, ${request.createdAt.toLocaleDateString("pt-BR")}`,{x:390,y:y-24,size:9,font:regular,color:black});
  page.drawText("Documento vinculado a protocolo digital • Sem CPF ou RG",{x:52,y:28,size:7.5,font:regular,color:muted});
  return Buffer.from(await pdf.save());
}
