# Endpoints — Secure v2

## Públicos
- `POST /api/public/session` — troca ID temporário por sessão HttpOnly.
- `GET /api/public/me` — retorna dados mínimos do contrato ligado à sessão.
- `POST /api/public/refund-preview` — calcula prévia usando contrato + regra do servidor.
- `POST /api/public/cancel` — registra cancelamento e, se homologado, tenta escrita EVO.
- `GET /api/public/status` — acompanha solicitações ligadas ao contrato da sessão.

Nenhum endpoint público aceita `contractId` arbitrário como autoridade. O contrato vem da sessão.

## Administração
- `POST /api/auth/admin/login` — login por e-mail/senha e TOTP opcional.
- `POST /api/auth/admin/logout` — encerra cookie.
- `POST /api/admin/evo/sync` — sincroniza cliente/contratos por ID EVO.
- `GET /api/admin/evo/usage` — consumo mensal da API.
- `POST /api/admin/access-grants` — emite ID temporário para um contrato.
- `POST /api/admin/rules` — cria/ativa regra financeira versionada.
- `POST /api/admin/requests/:id/decision` — aprova, rejeita ou confirma cancelamento manual.
- `POST /api/admin/requests/:id/refund` — registra estorno após cancelamento confirmado.

## EVO
- `POST /api/evo/webhook` — entrada autenticada e idempotente de eventos.

## Saúde
- `GET /api/health` — healthcheck sem revelar modo, token ou configuração interna.
