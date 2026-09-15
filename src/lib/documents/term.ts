import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CancellationRequest, Contract, Customer, RefundCalculation } from "@prisma/client";
import { decryptText } from "@/lib/security/crypto";

type TermData = { request: CancellationRequest; contract: Contract; customer: Customer; calculation?: RefundCalculation | null };

function wrap(text: string, max = 96) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      if (line) lines.push(line);
      line = word;
    } else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}

function safeDecrypt(ciphertext?: string | null, fallback?: string | null) {
  if (ciphertext) {
    try { return decryptText(ciphertext); } catch {}
  }
  return fallback?.trim() || "";
}

function reasonLabel(code: string, details?: string | null) {
  const labels: Record<string,string> = {
    MUDANCA: "Mudança",
    FINANCEIRO: "Financeiro",
    SAUDE: "Saúde",
    HORARIO: "Horário",
    ATENDIMENTO: "Atendimento",
    OUTRO: "Outro"
  };
  const base = labels[code] || code;
  return details ? `${base} — ${details}` : base;
}

export async function buildCancellationTerm({ request, contract, customer }: TermData) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.05,0.05,0.05);
  const muted = rgb(0.35,0.35,0.35);
  let y = 800;

  const draw = (txt:string,size=9.3,font=regular,x=48,color=black) => {
    page.drawText(txt,{x,y,size,font,color});
    y -= size + 4.5;
  };
  const paragraph = (txt:string,size=8.7,max=102) => {
    for (const line of wrap(txt,max)) draw(line,size,regular,48,black);
    y -= 3;
  };
  const field = (label:string,value:string) => paragraph(`${label} ${value || "________________________________________"}`,9.1,98);

  const memberId = safeDecrypt(customer.externalIdCiphertext, "");
  const cpf = safeDecrypt(customer.cpfCiphertext, "");
  const rg = safeDecrypt(request.requesterRgCiphertext, request.requesterRg);
  const address = safeDecrypt(request.requesterAddressCiphertext, request.requesterAddress);
  const pix = safeDecrypt(request.pixKeyCiphertext, request.pixKey);
  const createdDate = request.createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Belem" });
  const startDate = contract.startDate.toLocaleDateString("pt-BR", { timeZone: "America/Belem" });

  const title = contract.recurring ? "PEDIDO DE CANCELAMENTO (ANUAL RECORRENTE)" : "PEDIDO DE CANCELAMENTO";
  page.drawText(title,{x:48,y,size:15,font:bold,color:black});
  y -= 24;
  draw(`PROTOCOLO DIGITAL: ${request.protocol}`,8.5,bold,48,muted);
  y -= 4;

  field("EU,", customer.displayName);
  field("Inscrito(a) no CPF: sob o nº", cpf);
  field("e no RG nº", rg);
  field("Residente e domiciliado(a) à", address);
  paragraph("Venho pedir o cancelamento do meu CONTRATO com a EVOLUTION ACADEMIA e estou ciente das cláusulas do contrato.",9.2,100);
  field("Motivo do cancelamento: (É NECESSARIO O PREENCHIMENTO).", reasonLabel(request.reasonCode, request.reasonDetails));

  y -= 2;
  page.drawLine({start:{x:48,y},end:{x:547,y},thickness:0.6,color:muted});
  y -= 14;

  paragraph("Cláusula 21º. Este Contrato poderá ser rescindido por qualquer das partes, desde que a parte interessada comunique à outra, sendo que o CONTRATANTE somente poderá rescindir este contrato se estiver em dia com o pagamento das mensalidades, parcelas ou outros débitos existentes para com a CONTRATADA.",8.6,105);

  if (contract.recurring) {
    paragraph("CLÁUSULA 22º. A solicitação deve ser preenchida e assinada diretamente na recepção da CONTRATADA, pelo CONTRATANTE. Feito isso, enviar o cancelamento por e-mail .",8.6,105);
    paragraph("CLÁUSULA 23º. No caso de rescisão. O CONTRATANTE pagará uma multa no valor de R$ 258,00.",8.6,105);
  } else {
    paragraph("CLÁUSULA 22º. A solicitação deve ser preenchida e assinada diretamente na recepção da CONTRATADA, pelo CONTRATANTE até o dia de seu pagamento. Feito isso , enviar o cancelamento por e-mail",8.6,105);
    paragraph("CLÁUSULA 23º. No caso de rescisão. O CONTRATANTE pagará uma multa equivalente 14,4% a antecipação das parcelas, e 10% referente à multa do contrato, taxa do sistema.",8.6,105);
  }

  y -= 2;
  field("MATRÍCULA (ID)", memberId);
  field("DATA DO INÍCIO DO CONTRATO", startDate);
  field("PLANO", contract.planName);

  y -= 4;
  draw("ASSINATURA",9,bold);
  page.drawLine({start:{x:48,y:y-17},end:{x:330,y:y-17},thickness:0.7,color:black});
  y -= 30;
  draw(`BELÉM, ${createdDate}`,9,regular);

  if (contract.recurring) {
    y -= 3;
    paragraph("OBSERVAÇÃO: SOLICITAR CANCELAMENTO COM 30 DIAS DE ANTECEDÊNCIA DA PRÓXIMA MENSALIDADE.",8.8,102);
    paragraph("ENVIAR POR EMAIL: evolutionacademia.pa@gmail.com",8.8,102);
    paragraph("OBS: CANCELAMENTOS ENTREGUE NA RECEPÇÃO E NÃO ENVIADO POR EMAIL, NÃO TERÁ VALIDADE.",8.8,102);
  } else {
    field("PIX:", pix);
    paragraph("E-MAIL : evolutionacademia.pa@gmail.com.",8.8,102);
    paragraph("Obs. Prazo para o pagamento é em até 60 dias úteis.",8.8,102);
    paragraph("A partir da data de solicitação por e-mail .",8.8,102);
  }

  page.drawText(`Documento gerado pelo Evolution Cancelamento 360 • ${request.protocol}`,{x:48,y:22,size:7.2,font:regular,color:muted});
  return Buffer.from(await pdf.save());
}
