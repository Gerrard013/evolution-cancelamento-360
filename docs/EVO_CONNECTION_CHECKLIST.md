# Checklist de conexão EVO/W12

## Fase 1 — leitura

Defina no Railway:

```env
EVO_INTEGRATION_MODE=read
EVO_WRITE_ENABLED=false
CUSTOMER_DIRECT_CANCELLATION=false
EVO_API_BASE_URL=https://...
EVO_API_TOKEN=...
EVO_AUTH_MODE=bearer
EVO_MEMBER_BY_ID_PATH=/...
EVO_CONTRACTS_BY_MEMBER_PATH=/...
EVO_CONTRACT_BY_ID_PATH=/...
```

Teste nesta ordem:

1. ID real de aluno da Condor.
2. Nome retornado.
3. Unidade retornada.
4. Contrato ativo.
5. Plano, início/fim, valor pago e indicador de recorrência.
6. ID real de aluno do Umarizal.
7. Consumo de hits no painel.

Não avance se o adapter não mapear corretamente os campos.

## Fase 2 — escrita administrativa

Depois de confirmar o endpoint oficial de cancelamento:

```env
EVO_INTEGRATION_MODE=write
EVO_WRITE_ENABLED=true
CUSTOMER_DIRECT_CANCELLATION=false
EVO_CANCEL_CONTRACT_PATH=/...
EVO_CANCEL_METHOD=DELETE
```

Faça um teste em ambiente de homologação. Confirme:

- resposta de sucesso do EVO;
- idempotência;
- status final do contrato;
- efeito em cobranças/faturas;
- comportamento da configuração EVO “Cancelar nota fiscal quando o estorno for feito”.

O sistema não cria uma segunda chamada fiscal sem endpoint oficial para evitar dupla operação.

## Fase 3 — cancelamento pelo aluno

Somente após homologação:

```env
CUSTOMER_DIRECT_CANCELLATION=true
```

Mesmo nessa fase, a escrita ocorre **após o termo assinado ser recebido**. Falhas nunca apagam a solicitação: o caso cai em `MANUAL_REVIEW`.

## Segredo da API

`EVO_API_TOKEN` deve existir somente em Variables/Secrets do Railway. Nunca usar `NEXT_PUBLIC_`, nunca colocar em GitHub, print, log ou JavaScript enviado ao navegador.
