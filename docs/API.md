# Endpoints — Evolution Cancelamento 360 v7

## Públicos — identidade e cancelamento

- `POST /api/public/identity/start` — recebe CPF, e-mail, aceite LGPD e finalidade; consulta o EVO, exige correspondência do e-mail cadastrado e envia OTP por SMTP.
- `POST /api/public/identity/verify` — valida código de uso único, expiração e tentativas; cria sessão pré-autenticada HttpOnly.
- `POST /api/public/select-contract` — vincula um contrato ativo da identidade validada à sessão do cliente.
- `GET /api/public/me` — retorna somente dados do contrato ligado à sessão e à identidade OTP validada.
- `POST /api/public/refund-preview` — calcula a prévia financeira usando o contrato da sessão e regras do servidor.
- `POST /api/public/cancel` — registra a solicitação, exige RG/endereço/PIX quando aplicável e gera o termo oficial.
- `GET /api/public/term/:protocol` — baixa o termo da solicitação autorizada.
- `POST /api/public/signed-term` — recebe termo assinado após validação de tipo/tamanho/conteúdo permitido.
- `POST /api/public/finalize` — envia a solicitação para conclusão, respeitando taxa, homologação EVO e modo de escrita.
- `GET /api/public/status` — acompanha solicitações do contrato da sessão.
- `POST /api/public/protocol-status` — consulta protocolo somente após nova identidade CPF + e-mail + OTP.

O endpoint legado `POST /api/public/start` foi aposentado e retorna `410`. Matrícula + data de nascimento não são mais aceitos como autenticação suficiente.

Nenhum endpoint público aceita um `contractId` externo como autoridade isolada. A autorização vem da sessão vinculada a uma identidade confirmada pelo e-mail oficial do EVO.

## Administração

- `POST /api/auth/admin/login` — login da equipe; usuários ativos são confirmados no banco a cada requisição administrativa.
- `POST /api/auth/admin/logout` — encerra cookie administrativo.
- `GET/POST/PATCH /api/admin/users` — exclusivo do `OWNER`; lista, cria, reativa ou revoga acessos.
- `POST /api/admin/evo/sync` — sincronização administrativa quando necessária.
- `GET /api/admin/evo/usage` — consumo da API EVO.
- `POST /api/admin/requests/:id/decision` — decisão operacional protegida.
- `POST /api/admin/requests/:id/refund` — registro de estorno após cancelamento confirmado.
- `GET /api/admin/documents/:id` — documento protegido para perfis administrativos autorizados.

## EVO/W12

A integração externa é server-side. O frontend nunca recebe token EVO.

Recursos confirmados pelo suporte no escopo atual:

- busca de membros em `/api/v1/members`;
- entidade `MemberMembership` para contratos;
- entidade `Invoices` para financeiro;
- `POST cancel-membermembership` para cancelamento.

Os query params e payload exatos são configuráveis por environment variables e devem ser copiados da documentação/homologação da conta antes do go-live. O sistema bloqueia a escrita se `EVO_WRITE_HOMOLOGATED` não estiver explicitamente habilitado.

## Webhook EVO

- `POST /api/evo/webhook` — entrada autenticada e idempotente, disponível quando a academia tiver API Pro e webhook configurado.

## Saúde

- `GET /api/health` — healthcheck sem revelar token, senha SMTP, chaves, paths internos ou configuração sensível.
