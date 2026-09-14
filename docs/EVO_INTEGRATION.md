# Integração EVO/W12 — v6

## Modos

- `manual`: sem chamadas ao EVO; útil apenas como contingência administrativa.
- `read`: portal público e painel podem consultar aluno e contratos.
- `write`: permite cancelamento quando `EVO_WRITE_ENABLED=true`.

## Autenticação

O adaptador suporta:
- `basic`: usuário/DNS + token;
- `bearer`: Bearer token;
- `header`: token em header customizado.

O suporte informou geração do token em **Configuração > Integrações > EVO** e documentação em `https://api.abcevo.com/`.

A documentação pode ser um portal separado do host de chamadas. Portanto `EVO_API_BASE_URL` deve receber a **URL base real indicada na documentação/homologação**, não é preenchida automaticamente.

## Leitura

Variáveis:

```env
EVO_INTEGRATION_MODE=read
EVO_API_BASE_URL=<URL BASE REAL>
EVO_AUTH_MODE=basic
EVO_API_USERNAME=<DNS/USUÁRIO>
EVO_API_TOKEN=<TOKEN>
EVO_MEMBER_BY_ID_PATH=<ROTA ALUNO POR ID>
EVO_CONTRACTS_BY_MEMBER_PATH=<ROTA CONTRATOS DO ALUNO>
EVO_CONTRACT_BY_ID_PATH=<ROTA CONTRATO, SE NECESSÁRIO>
```

Os templates aceitam `{id}`, `{memberId}` e `{contractId}` conforme o endpoint.

## Mapeamento esperado

Aluno:
- ID;
- nome;
- data de nascimento;
- telefone/e-mail apenas como hint interno quando retornado.

Contrato:
- ID;
- ID do aluno;
- unidade;
- plano/tipo;
- início;
- fim quando existir;
- **valor total do contrato/plano**;
- recorrente ou anual;
- status.

O adaptador aceita nomes de campos comuns em português/inglês, mas a homologação com ID 29965 é obrigatória para confirmar o JSON real.

## Escrita

Depois da leitura estar correta:

```env
EVO_INTEGRATION_MODE=write
EVO_WRITE_ENABLED=true
EVO_CANCEL_CONTRACT_PATH=<ROTA OFICIAL>
EVO_CANCEL_METHOD=DELETE
CUSTOMER_DIRECT_CANCELLATION=false
```

Se a rota oficial usar `PUT`, altere `EVO_CANCEL_METHOD=PUT` somente após confirmar o corpo exigido pela documentação.

## Remoção da forma de pagamento

```env
EVO_REMOVE_PAYMENT_METHOD_ENABLED=true
EVO_REMOVE_PAYMENT_METHOD_PATH=<ROTA OFICIAL>
EVO_REMOVE_PAYMENT_METHOD_METHOD=DELETE
```

Essa etapa é executada somente para contrato recorrente cancelado. Se falhar, o pedido fica em revisão da equipe em vez de ser marcado como totalmente concluído.

## Consumo

O projeto mantém cache curto e contador mensal. Não usa polling agressivo.
