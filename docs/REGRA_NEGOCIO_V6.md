# Regra de negócio — Evolution Cancelamento 360 v6

## Objetivo

Transformar o portal no canal digital oficial de cancelamento da Evolution Academia, substituindo o envio diário de e-mails e reduzindo conflitos presenciais na recepção.

## Identificação do aluno

- entrada pública: matrícula/ID EVO + data de nascimento;
- não usar CPF como chave do portal;
- a matrícula não funciona sozinha como senha;
- a data de nascimento é validada contra o cadastro retornado pelo EVO e não precisa ser persistida pelo sistema.

## Plano anual

1. `valorMensal = valorTotal / 12`.
2. Contar meses de calendário do mês de início ao mês do pedido, incluindo ambos.
3. `mesesRestantes = max(0, 12 - mesesUtilizados)`.
4. `saldoRestante = valorMensal * mesesRestantes`.
5. `descontoAntecipacao = valorTotal * 0,144`.
6. `multaTaxa = valorTotal * 0,10`.
7. `estorno = max(0, saldoRestante - descontoAntecipacao - multaTaxa)`.

### Exemplo

Valor total: R$ 1.200,00. Início: 30/12/2025. Pedido: 13/09/2026.

- meses usados: 10;
- meses restantes: 2;
- valor mensal: R$ 100,00;
- saldo restante: R$ 200,00;
- 14,4%: R$ 172,80;
- 10%: R$ 120,00;
- estorno: R$ 0,00.

O termo anual fornecido informa **14,4%**, portanto o sistema usa 14,4% — não 14%.

## Plano recorrente

- não há estorno;
- se a data solicitada for anterior ao aniversário de 12 meses do contrato: taxa de R$ 258,00;
- se já completou 12 meses: taxa R$ 0,00;
- se houver taxa, o pedido fica aguardando confirmação do pagamento;
- depois da confirmação, o contrato pode ser cancelado;
- após o cancelamento, remover a forma de pagamento/cartão recorrente quando a rota oficial EVO estiver homologada.

## Fluxo oficial do aluno

Matrícula + nascimento → contratos ativos → motivo/data → valores → termo PDF → assinatura → upload → protocolo → acompanhamento.

## Fluxo da equipe

Painel → acompanhar protocolo → conferir termo/comprovante → confirmar taxa quando houver → cancelar contrato → confirmar remoção do pagamento → registrar estorno quando houver.
