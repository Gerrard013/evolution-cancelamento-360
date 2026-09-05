import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { CancellationRequest, Contract, Customer } from "@prisma/client";

type TermData = {
  request: CancellationRequest;
  contract: Contract;
  customer: Customer;
};

function wrap(text: string, max = 92) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) { if (line) lines.push(line); line = word; }
    else line = (line + " " + word).trim();
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildCancellationTerm({ request, contract, customer }: TermData) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.08, 0.1, 0.12);
  const green = rgb(0.13, 0.55, 0.22);
  const muted = rgb(0.35, 0.4, 0.43);
  let y = 790;
  const draw = (txt: string, size=10, font=regular, color=black, x=52) => { page.drawText(txt, { x, y, size, font, color }); y -= size + 7; };
  const paragraph = (txt: string, size=9.5) => { for (const line of wrap(txt, 98)) draw(line, size); y -= 4; };
  const lineField = (label: string, value: string) => { draw(label, 8.5, bold, muted); draw(value || "Não informado", 11, regular, black); y -= 3; };

  page.drawRectangle({ x: 0, y: 810, width: 595.28, height: 31.89, color: rgb(0.03,0.12,0.08) });
  page.drawText("EVOLUTION ACADEMIA • CANCELAMENTO 360", { x: 52, y: 821, size: 10, font: bold, color: rgb(0.82,1,0.84) });
  y = 784;
  draw(contract.recurring ? "PEDIDO DE CANCELAMENTO — PLANO RECORRENTE" : "PEDIDO DE CANCELAMENTO — PLANO ANUAL", 16, bold, green);
  draw(`Protocolo: ${request.protocol}`, 9, bold, muted); y -= 8;

  lineField("ALUNO", customer.displayName);
  lineField("MATRÍCULA / ID EVO", "Identificador validado pelo sistema e não exibido neste documento público");
  lineField("UNIDADE", contract.unit);
  lineField("PLANO", contract.planName);
  lineField("INÍCIO DO CONTRATO", contract.startDate.toLocaleDateString("pt-BR"));
  lineField("DATA DA SOLICITAÇÃO", request.createdAt.toLocaleDateString("pt-BR"));
  lineField("ENDEREÇO INFORMADO", request.requesterAddress || "Não informado");
  lineField("E-MAIL DE CONTATO", request.contactEmail || "Não informado");
  if (!contract.recurring) lineField("CHAVE PIX PARA EVENTUAL ESTORNO", request.pixKey || "Não informado");

  draw("DECLARAÇÃO", 10, bold, green); y -= 2;
  paragraph("Venho solicitar o cancelamento do meu contrato com a EVOLUTION ACADEMIA e declaro estar ciente das cláusulas contratuais aplicáveis ao meu plano, dos prazos de análise e das condições financeiras vigentes.");
  lineField("MOTIVO DO CANCELAMENTO", `${request.reasonCode}${request.reasonDetails ? ` — ${request.reasonDetails}` : ""}`);

  draw("CONDIÇÕES DE REFERÊNCIA DO TERMO OPERACIONAL", 10, bold, green); y -= 2;
  paragraph("Cláusula 21ª: o contrato poderá ser rescindido por qualquer das partes, observadas as obrigações financeiras existentes e as condições do contrato vigente.");
  if (contract.recurring) {
    paragraph("Plano recorrente: o modelo operacional fornecido pela academia prevê comunicação do pedido, assinatura do contratante e multa de R$ 258,00, além de antecedência de 30 dias da próxima mensalidade. A aplicação efetiva depende da conferência do contrato do aluno.");
  } else {
    paragraph("Plano anual: o modelo operacional fornecido pela academia prevê multa equivalente a 14,4% sobre a antecipação das parcelas e 10% referente à multa do contrato/taxa do sistema, com prazo informado de até 60 dias úteis para pagamento de eventual estorno. A aplicação efetiva depende da conferência do contrato do aluno.");
  }
  paragraph("Este documento foi gerado pelo Evolution Cancelamento 360. O sistema substitui o envio manual por e-mail apenas quando o fluxo digital estiver formalmente aprovado pela Evolution Academia e configurado para produção.");

  y -= 10;
  draw("ASSINATURA DO ALUNO", 9, bold, muted);
  page.drawLine({ start: { x: 52, y: y-24 }, end: { x: 350, y: y-24 }, thickness: 0.8, color: muted });
  page.drawText("Assinar e enviar o arquivo pelo portal do aluno", { x: 52, y: y-39, size: 8.5, font: regular, color: muted });
  page.drawText(`Belém, ${request.createdAt.toLocaleDateString("pt-BR")}`, { x: 390, y: y-24, size: 9, font: regular, color: black });

  page.drawText("Documento gerado automaticamente • Não contém CPF ou RG • Protocolo auditável", { x: 52, y: 28, size: 7.5, font: regular, color: muted });
  return Buffer.from(await pdf.save());
}
