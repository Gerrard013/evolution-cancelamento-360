# Runbook operacional — Final v6

## 1. O que entra em produção

### Portal do aluno
- solicitação sem e-mail;
- matrícula EVO + data de nascimento;
- contratos ativos vindos do EVO;
- cálculo anual automático;
- regra recorrente de R$ 258 antes de 12 meses;
- geração do termo PDF;
- upload do termo assinado;
- upload do comprovante da taxa quando aplicável;
- protocolo e consulta posterior do status.

### Painel da equipe
- login separado de Gerrard e Ruy;
- fila de pedidos;
- atendimento assistido pela matrícula;
- download do termo assinado;
- download do comprovante da taxa;
- confirmação da taxa;
- execução do cancelamento;
- confirmação manual quando a escrita EVO estiver desativada;
- registro de estorno;
- auditoria.

## 2. Estados principais

- `AWAITING_SIGNATURE`: termo gerado e aguardando upload.
- `SIGNED_RECEIVED`: termo assinado recebido.
- `FEE_PENDING`: taxa de R$ 258 pendente/aguardando confirmação.
- `READY_TO_CANCEL`: todos os pré-requisitos concluídos.
- `UNDER_REVIEW`: EVO aceitou a operação mas ainda não confirmou cancelamento.
- `MANUAL_REVIEW`: a equipe precisa concluir ou conferir no EVO.
- `REFUND_PENDING`: contrato cancelado e há estorno a pagar.
- `COMPLETED`: fluxo concluído.

A interface mostra rótulos em português, não códigos internos.

## 3. Segurança

- token EVO apenas no backend/Railway;
- cookies HttpOnly + Secure + SameSite;
- rate limit no login e portal;
- matrícula + data de nascimento para reduzir enumeração;
- IDs externos pseudonimizados por HMAC e criptografados quando precisam ser reutilizados;
- termo/comprovante privado no PostgreSQL;
- PDF/JPG/PNG até 8 MB;
- magic bytes, MIME, SHA-256 e bloqueio de PDF ativo suspeito;
- CSP, HSTS, anti-clickjacking e nosniff;
- trilha de auditoria;
- `write` EVO desativado até homologação.

## 4. Implantação hoje

1. Postgres Online no Railway.
2. Aplicação com `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
3. Configurar segredos e hashes dos administradores.
4. Fazer deploy e confirmar `/api/health`.
5. Configurar API EVO em `read`.
6. Testar ID conhecido, por exemplo 29965.
7. Validar nome, nascimento, Condor/Umarizal, contrato, tipo, início e valor total do plano.
8. Fazer um cancelamento de teste completo até o protocolo.
9. Só depois configurar rotas de escrita.

## 5. Homologação de escrita

- testar `EVO_CANCEL_CONTRACT_PATH` com contrato de homologação;
- confirmar resposta que significa cancelado de fato;
- testar `EVO_REMOVE_PAYMENT_METHOD_PATH` em plano recorrente;
- manter `CUSTOMER_DIRECT_CANCELLATION=false` durante homologação;
- somente após os testes liberar automação direta, se Ruy aprovar.

## 6. Nota fiscal

O EVO possui configuração para cancelar nota fiscal quando o estorno for feito. Não criar uma segunda chamada fiscal sem confirmar o comportamento da conta, para não duplicar o cancelamento da NF.
