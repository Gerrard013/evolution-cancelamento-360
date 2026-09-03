# Evolution Cancelamento 360 — Secure v2

Plataforma G Tech para solicitação de cancelamento, prévia de estorno, fila administrativa, auditoria e integração controlada com EVO/W12.

## O que mudou nesta versão
- Portal público sem CPF: acesso por ID temporário de alta entropia.
- ID do EVO pseudonimizado no banco: hash para busca + criptografia para uso estritamente server-side.
- Chave da API EVO somente em variável secreta do Railway, nunca em `NEXT_PUBLIC_*` e nunca no frontend.
- Login administrativo separado, sessão curta, cookie `HttpOnly`, `Secure` em produção e `SameSite=Strict`.
- TOTP opcional para o administrador.
- Rate limit, validação de origem, limite de payload e validação Zod.
- CSP com nonce, HSTS, anti-clickjacking, `nosniff`, `Referrer-Policy` e `Permissions-Policy`.
- Adaptador EVO com bloqueio de SSRF, HTTPS obrigatório, timeout, sem redirects e limite de resposta.
- Cache de leitura EVO e contador mensal de hits para reduzir consumo da API.
- Webhook com HMAC ou bearer, janela anti-replay e idempotência.
- Cancelamento direto pelo EVO somente quando **três condições** estiverem habilitadas: modo `write`, `EVO_WRITE_ENABLED=true` e `CUSTOMER_DIRECT_CANCELLATION=true`.
- Sem endpoint de cancelamento EVO hardcoded: a escrita só é liberada depois de confirmar os endpoints reais na documentação/homologação.
- Upload público desativado. Isso reduz a superfície de malware. O modelo de anexo mantém quarentena para futura implementação controlada.
- GitHub Actions, Dependabot e verificação local para reduzir risco de segredo e dependência vulnerável.

## Importante sobre LGPD
Trocar CPF por ID é uma excelente medida de minimização, mas **não elimina a aplicação da LGPD**. Um ID que possa ser relacionado a uma pessoa continua sendo dado pessoal. Por isso esta versão usa um ID público opaco e temporário, além de pseudonimizar os identificadores internos do EVO.

## Fluxo do cliente
1. Cliente recebe um ID temporário por canal confiável.
2. Acessa `/cliente` e informa somente esse ID.
3. Visualiza os dados mínimos do contrato.
4. Informa motivo e data desejada.
5. Aceita o termo versionado.
6. Visualiza a prévia de estorno, quando houver regra financeira homologada.
7. Confirma o pedido.
8. O sistema gera protocolo, auditoria e tenta escrita no EVO somente se a função estiver homologada e habilitada.
9. Se a integração falhar, a solicitação cai em `MANUAL_REVIEW` sem perder o protocolo.

## Fluxo administrativo
1. Acessar `/equipe/login`.
2. Autenticar com e-mail, senha forte e, em produção, TOTP.
3. Sincronizar aluno por ID/matrícula EVO.
4. Gerar um ID temporário de acesso para o contrato correto.
5. Acompanhar fila, SLA, status e prévias.
6. Aprovar, rejeitar ou confirmar cancelamento manual pelos endpoints administrativos.
7. Registrar estorno somente depois do cancelamento estar confirmado.

## Rodar localmente
```bash
cp .env.example .env
npm install
npm run admin:hash -- "SUA-SENHA-FORTE-COM-14+-CARACTERES"
# copie o hash para ADMIN_PASSWORD_HASH no .env
npm run prisma:generate
npm run prisma:push
npm run dev
```

Modo demonstração local: use `EV-DEMO-2026` no portal do cliente. Essa credencial de demonstração é bloqueada automaticamente em `NODE_ENV=production`.

## Antes de produção
- `NEXT_PUBLIC_DEMO_MODE=false`.
- `APP_ORIGIN` com o domínio HTTPS oficial.
- `SESSION_SECRET`, `PUBLIC_ID_PEPPER`, `EXTERNAL_ID_PEPPER` e `IP_HASH_PEPPER` distintos e aleatórios.
- `APP_DATA_ENCRYPTION_KEY` com exatamente 32 bytes em Base64.
- `ADMIN_TOTP_SECRET` configurado.
- Banco PostgreSQL do Railway.
- Regra de cálculo aprovada e ativada.
- Mapeamento dos endpoints EVO testado em homologação.
- Webhook com assinatura/bearer conforme o mecanismo real suportado pelo EVO.
- WAF/rate limit de borda na frente do Railway.
- Backup, observabilidade, alerta e plano de resposta a incidente.

Leia também:
- `docs/SECURITY.md`
- `docs/LGPD.md`
- `docs/EVO_INTEGRATION.md`
- `docs/DEPLOY_RAILWAY.md`
- `docs/PENTEST_CHECKLIST.md`
