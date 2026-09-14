# Evolution Cancelamento 360 — Final Operacional v6

Canal digital oficial de cancelamento da Evolution Academia para as unidades **Condor** e **Umarizal**. O objetivo é retirar o cancelamento do e-mail e reduzir atendimentos presenciais: o aluno solicita pelo próprio portal e a equipe acompanha a execução no painel administrativo.

## Fluxo do aluno

1. Informa **matrícula EVO + data de nascimento**. Não usa CPF.
2. O sistema consulta o EVO/W12 e mostra somente contratos ativos daquele aluno.
3. O aluno escolhe o contrato, informa motivo e data do cancelamento.
4. O sistema apresenta os valores aplicáveis.
5. Gera o termo de cancelamento em PDF.
6. O aluno assina e faz upload do termo no próprio portal.
7. Recebe protocolo.
8. Pode voltar ao início e usar **Consultar protocolo** para acompanhar o pedido.

## Plano anual — regra operacional

- valor mensal = valor total do plano ÷ 12;
- meses utilizados = meses de calendário entre o mês de início e o mês do pedido, contando os dois meses;
- meses restantes = 12 − meses utilizados;
- saldo restante = valor mensal × meses restantes;
- desconto de antecipação = **14,4% do valor total**;
- multa/taxa = **10% do valor total**;
- estorno = `máximo(0, saldo restante − 14,4% − 10%)`.

Exemplo confirmado no projeto: plano de R$ 1.200,00, início em 30/12/2025 e cancelamento em 13/09/2026. São 10 meses considerados utilizados e 2 restantes. Valor mensal de R$ 100,00; saldo restante R$ 200,00; 14,4% = R$ 172,80; 10% = R$ 120,00; estorno final = **R$ 0,00**.

> O percentual implementado é 14,4%, conforme o termo anual fornecido. Por isso, em R$ 1.200,00 o valor correto é R$ 172,80.

## Plano recorrente

- não existe estorno;
- antes de completar 12 meses: taxa de cancelamento de **R$ 258,00**;
- com 12 meses ou mais: sem taxa antecipada;
- após a taxa ser confirmada, quando aplicável, o contrato segue para cancelamento;
- após o cancelamento, a forma de pagamento/cartão recorrente pode ser removida automaticamente pelo EVO quando o endpoint de escrita estiver homologado.

## Painel da equipe

Gerrard e Ruy possuem acessos separados. O painel mostra pedidos, termo assinado, comprovante da taxa, status, valor de estorno, confirmação de taxa, execução do cancelamento e registro do estorno.

Existe também um atendimento assistido: a equipe localiza o aluno pela matrícula e abre o formulário no mesmo aparelho. Nenhum link ou código é exibido ao aluno.

## API EVO/W12

O código já está preparado para `manual`, `read` e `write`.

- `read`: aluno/ID, contratos, unidade, plano, datas e valor do contrato;
- `write`: cancelamento do contrato;
- remoção de pagamento: endpoint separado para retirar cartão/forma recorrente após o cancelamento.

Os **paths reais** precisam ser copiados da documentação/homologação EVO. O projeto não inventa endpoint destrutivo.

Documentação informada pelo suporte: `https://api.abcevo.com/`.

## Railway

A aplicação precisa receber:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

O Docker executa `prisma db push` antes de iniciar. Todas as credenciais EVO e chaves de segurança ficam somente nas Variables do Railway.

## Verificações

```bash
npm run security:check
npm run business:check
npm run production:check
npm run typecheck
npm run build
```

Consulte `docs/FINAL_RUNBOOK.md` e `docs/API_EVO_CONFIG_AGORA.md` para implantação.
