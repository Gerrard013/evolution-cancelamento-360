import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CancellationRequest, Contract, Customer, RefundCalculation } from "@prisma/client";
import { decryptText } from "@/lib/security/crypto";

export type TermData = { request: CancellationRequest; contract: Contract; customer: Customer; calculation?: RefundCalculation | null };

function brl(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function safeDecrypt(value?: string | null, fallback = "Não informado") {
  try { return value ? decryptText(value) : fallback; } catch { return fallback; }
}

function wrapByWidth(text: string, font: any, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function memoryNumber(memory: unknown, key: string) {
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) return undefined;
  const value = (memory as Record<string, unknown>)[key];
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export async function buildCancellationTerm({ request, contract, customer, calculation }: TermData) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.08, 0.08, 0.08);
  const muted = rgb(0.32, 0.34, 0.35);
  const green = rgb(0.08, 0.38, 0.20);
  const line = rgb(0.78, 0.80, 0.79);
  const pageSize:[number,number]=[595.28, 841.89];
  const margin=48;
  const width=pageSize[0]-margin*2;
  let page=pdf.addPage(pageSize);
  let y=792;

  const ensure=(height:number)=>{
    if(y-height<58){
      page=pdf.addPage(pageSize); y=792;
      page.drawText("EVOLUTION ACADEMIA • PEDIDO DE CANCELAMENTO",{x:margin,y,size:8,font:bold,color:green}); y-=24;
    }
  };
  const draw=(text:string,size=9.3,font=regular,color=black,x=margin)=>{ensure(size+8);page.drawText(text,{x,y,size,font,color});y-=size+7;};
  const paragraph=(text:string,size=8.9,font=regular,color=black)=>{
    const lines=wrapByWidth(text,font,size,width);
    ensure(lines.length*(size+4)+6);
    for(const row of lines){page.drawText(row,{x:margin,y,size,font,color});y-=size+4;}
    y-=4;
  };
  const field=(label:string,value:string)=>{
    ensure(30);
    page.drawText(label,{x:margin,y,size:7.8,font:bold,color:muted});
    y-=11;
    page.drawText(value || "Não informado",{x:margin,y,size:9.5,font:regular,color:black});
    page.drawLine({start:{x:margin,y:y-3},end:{x:margin+width,y:y-3},thickness:.45,color:line});
    y-=14;
  };

  const recurring=contract.recurring;
  const cpf=safeDecrypt(customer.documentCiphertext);
  const rg=safeDecrypt(request.rgCiphertext);
  const memberId=safeDecrypt(customer.externalIdCiphertext,"Identificador confirmado no EVO");
  const contactEmail=process.env.CANCELLATION_CONTACT_EMAIL?.trim() || "evolutionacademia.pa@gmail.com";
  const requestDate=request.createdAt.toLocaleDateString("pt-BR",{timeZone:"America/Belem"});

  page.drawRectangle({x:0,y:815,width:pageSize[0],height:26,color:rgb(0.035,0.13,0.075)});
  page.drawText("EVOLUTION ACADEMIA • CANAL OFICIAL DE CANCELAMENTO",{x:margin,y:824,size:8.5,font:bold,color:rgb(.86,1,.9)});
  draw(recurring?"PEDIDO DE CANCELAMENTO (ANUAL RECORRENTE)":"PEDIDO DE CANCELAMENTO",14,bold,black);
  draw(`PROTOCOLO: ${request.protocol}`,8.5,bold,green); y-=3;

  field("EU",customer.displayName);
  field("CPF",cpf);
  field("RG",rg);
  field("RESIDENTE E DOMICILIADO(A) À",request.requesterAddress || "Não informado");

  paragraph("Venho pedir o cancelamento do meu CONTRATO com a EVOLUTION ACADEMIA e estou ciente das cláusulas do contrato.",9.1);
  field("MOTIVO DO CANCELAMENTO (É NECESSÁRIO O PREENCHIMENTO)",`${request.reasonCode}${request.reasonDetails?` — ${request.reasonDetails}`:""}`);

  draw("CONDIÇÕES CONTRATUAIS",9,bold,green);
  paragraph("Cláusula 21º. Este Contrato poderá ser rescindido por qualquer das partes, desde que a parte interessada comunique à outra, sendo que o CONTRATANTE somente poderá rescindir este contrato se estiver em dia com o pagamento das mensalidades, parcelas ou outros débitos existentes para com a CONTRATADA.",8.45);
  if(recurring){
    paragraph("CLÁUSULA 22º. A solicitação deve ser preenchida e assinada diretamente na recepção da CONTRATADA, pelo CONTRATANTE. Feito isso, enviar o cancelamento por e-mail.",8.45);
    paragraph("CLÁUSULA 23º. No caso de rescisão. O CONTRATANTE pagará uma multa no valor de R$ 258,00.",8.45,bold);
  }else{
    paragraph("CLÁUSULA 22º. A solicitação deve ser preenchida e assinada diretamente na recepção da CONTRATADA, pelo CONTRATANTE até o dia de seu pagamento. Feito isso, enviar o cancelamento por e-mail.",8.45);
    paragraph("CLÁUSULA 23º. No caso de rescisão. O CONTRATANTE pagará uma multa equivalente 14,4% a antecipação das parcelas, e 10% referente à multa do contrato, taxa do sistema.",8.45,bold);
  }

  field("MATRÍCULA (ID)",memberId);
  field("DATA DO INÍCIO DO CONTRATO",contract.startDate.toLocaleDateString("pt-BR",{timeZone:"America/Belem"}));
  field("PLANO",contract.planName);

  if(recurring){
    paragraph("OBSERVAÇÃO: SOLICITAR CANCELAMENTO COM 30 DIAS DE ANTECEDÊNCIA DA PRÓXIMA MENSALIDADE.",8.6,bold);
  }else if(calculation){
    draw("MEMÓRIA DO ESTORNO",9,bold,green);
    const monthsUsed=memoryNumber(calculation.memory,"monthsUsed");
    const monthsRemaining=memoryNumber(calculation.memory,"monthsRemaining");
    const monthlyReference=memoryNumber(calculation.memory,"monthlyReference") ?? Number(calculation.eligibleBase)/12;
    const advanceDeduction=memoryNumber(calculation.memory,"advanceDeduction") ?? Number(calculation.eligibleBase)*0.144;
    const contractFee=memoryNumber(calculation.memory,"contractFee") ?? Number(calculation.eligibleBase)*0.10;
    paragraph(`Valor total do plano: ${brl(Number(calculation.eligibleBase))} • Referência mensal: ${brl(monthlyReference)}${monthsUsed!==undefined?` • Meses utilizados: ${monthsUsed}`:""}${monthsRemaining!==undefined?` • Meses restantes: ${monthsRemaining}`:""}.`,8.2);
    paragraph(`Saldo dos meses restantes: ${brl(Number(calculation.unusedBalance))} • 14,4% sobre o valor total: - ${brl(advanceDeduction)} • 10% sobre o valor total: - ${brl(contractFee)} • Estorno previsto: ${brl(Number(calculation.estimatedRefund))}.`,8.2);
    if(Number(calculation.estimatedRefund)>0) field("PIX",request.pixKey || "Não informado");
    paragraph("OBS. Prazo operacional informado pela Evolution Academia para o pagamento do estorno: em até 60 dias úteis a partir da data de solicitação registrada no canal oficial. Esta informação reproduz o prazo operacional do termo vigente e não é apresentada como citação de lei.",8.25,bold);
    if(request.refundDueAt) paragraph(`Data-limite operacional estimada pelo sistema (contagem de dias úteis de segunda a sexta, sem calendário de feriados): ${request.refundDueAt.toLocaleDateString("pt-BR",{timeZone:"America/Belem"})}.`,7.8,regular,muted);
  }

  field("E-MAIL DO CANAL OFICIAL",contactEmail);
  draw("ASSINATURA",9,bold,black);
  ensure(58);
  page.drawLine({start:{x:margin,y:y-24},end:{x:margin+300,y:y-24},thickness:.8,color:black});
  page.drawText("Assinatura do(a) contratante",{x:margin,y:y-38,size:7.5,font:regular,color:muted});
  page.drawText(`BELÉM, ${requestDate}`,{x:margin+340,y:y-24,size:8.5,font:regular,color:black});
  y-=58;

  draw("REGISTRO DIGITAL DO CANAL 360",8.5,bold,green);
  paragraph(`Identidade confirmada por CPF vinculado ao EVO/W12 e código de uso único enviado ao e-mail cadastrado (${request.verifiedEmailMask || "e-mail confirmado"}). Aceite de tratamento de dados registrado em ${request.lgpdConsentAt?request.lgpdConsentAt.toLocaleString("pt-BR",{timeZone:"America/Belem"}):requestDate}, versão ${request.lgpdConsentVersion || "vigente"}. Protocolo ${request.protocol}.`,7.7,regular,muted);
  paragraph("No fluxo digital oficial, o envio do termo assinado pelo próprio portal registra eletronicamente a solicitação e preserva protocolo e trilha de auditoria.",7.7,regular,muted);

  for(const [index,p] of pdf.getPages().entries()){
    p.drawText(`Evolution Academia • ${request.protocol} • página ${index+1}/${pdf.getPageCount()}`,{x:margin,y:24,size:6.8,font:regular,color:muted});
  }
  return Buffer.from(await pdf.save());
}
