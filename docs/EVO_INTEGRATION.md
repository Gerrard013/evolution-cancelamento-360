# Integração EVO/W12

## Princípio
A integração é um adaptador. O núcleo do cancelamento continua registrando protocolo e auditoria mesmo se o EVO estiver indisponível.

## Modos
- `manual`: não chama EVO.
- `read`: permite sincronizar aluno/contratos por ID e usar cache.
- `write`: permite escrita **somente** com `EVO_WRITE_ENABLED=true`.

O cancelamento disparado diretamente pelo cliente ainda exige `CUSTOMER_DIRECT_CANCELLATION=true`.

## Por que os endpoints de escrita não vêm preenchidos
A conversa com o suporte confirma a existência da API, mas a implementação final precisa usar os endpoints reais e homologados da documentação do EVO. Cancelamento é operação destrutiva; não é seguro adivinhar uma rota.

Configure no Railway após validar:
- `EVO_MEMBER_BY_ID_PATH`
- `EVO_CONTRACTS_BY_MEMBER_PATH`
- `EVO_CONTRACT_BY_ID_PATH`
- `EVO_CANCEL_CONTRACT_PATH`
- `EVO_CANCEL_METHOD`

Os templates aceitam `{id}`, `{memberId}` ou `{contractId}` conforme o campo.

## Autenticação
Suporta:
- bearer;
- basic com usuário + token;
- header customizado.

O token só é lido no backend.

## Consumo de API
Cada hit é contado por mês em `EvoApiUsage`.
- soft limit padrão: 900;
- hard limit padrão: 990.

Leituras usam cache curto:
- aluno: 15 min;
- lista de contratos: 10 min;
- contrato: 10 min.

Webhooks invalidam cache sem polling.

## Cancelamento direto
Fluxo:
1. cliente aceita o termo;
2. pedido é persistido e auditado;
3. sistema valida flags de escrita;
4. chama EVO com `Idempotency-Key=protocolo`;
5. sucesso: marca contrato cancelado;
6. falha/timeout: `MANUAL_REVIEW`;
7. estorno financeiro não é executado automaticamente.

## Nota fiscal
A tela enviada mostra a opção do EVO “Cancelar nota fiscal quando o estorno for feito”. Se essa configuração estiver ativa no EVO, não duplique a ação fiscal em outra integração sem confirmar o comportamento do fornecedor. O endpoint de registro de estorno devolve essa observação para a equipe.
