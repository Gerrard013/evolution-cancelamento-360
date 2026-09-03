# Segurança — Secure v2

Nenhum sistema conectado à internet pode ser “100% imune” a atacantes. O objetivo desta versão é reduzir a superfície de ataque, impedir falhas comuns de pentest e criar controles de contenção, detecção e recuperação.

## 1. Segredos
- API key EVO fica somente no backend em `EVO_API_TOKEN`.
- Nenhum segredo usa prefixo `NEXT_PUBLIC_`.
- `.env` e certificados/chaves são ignorados pelo Git.
- O ZIP de entrega não contém `.env` nem `.git`.
- Rotacione a API key imediatamente se ela já tiver sido exposta em commit, log, print ou frontend.
- Use variáveis/Secrets do Railway para produção.

## 2. Autenticação e sessão administrativa
- Área `/equipe` exige sessão autenticada.
- Senha armazenada apenas como hash PBKDF2 no ambiente.
- TOTP opcional no código e recomendado como obrigatório em produção.
- Cookie administrativo: HttpOnly, Secure em produção, SameSite=Strict, expiração curta de 15 minutos.
- Login protegido por rate limit.
- Para equipe maior, evoluir para SSO/OIDC corporativo e MFA individual por usuário.

## 3. Portal público
- Não solicita CPF.
- Usa ID temporário aleatório de alta entropia.
- Banco armazena somente o hash do ID de acesso; o código em texto claro é exibido uma única vez na criação.
- Acesso expira e pode ser revogado.
- Tentativas repetidas sofrem rate limit.
- O contrato é validado novamente no backend antes de qualquer cancelamento.

## 4. Proteções HTTP e browser
- CSP com nonce e `frame-ancestors 'none'`.
- HSTS em produção.
- X-Frame-Options DENY.
- X-Content-Type-Options nosniff.
- Referrer-Policy no-referrer.
- Permissions-Policy bloqueando câmera, microfone, geolocalização, pagamento e USB.
- Cache desativado para portal, painel e APIs sensíveis.
- TRACE e CONNECT bloqueados.

## 5. CSRF, XSS e injeção
- Requisições de alteração exigem `Origin` igual a `APP_ORIGIN`.
- Cookies SameSite=Strict.
- React escapa conteúdo exibido por padrão.
- Inputs validados por Zod e com limites de tamanho.
- Prisma gera queries parametrizadas e reduz risco de SQL Injection.
- Nenhuma função executa shell com entrada do usuário.

## 6. API EVO
- HTTPS obrigatório em produção.
- Paths de endpoint devem começar com `/` e não podem conter URL externa.
- A origem final é conferida para bloquear SSRF.
- Redirects são recusados.
- Timeout de chamada.
- Limite máximo de resposta.
- API key nunca é retornada em resposta ou log.
- Escrita desativada por padrão.
- `Idempotency-Key` usa o protocolo do pedido quando a escrita é habilitada.
- Falha de integração nunca apaga o pedido: cai em revisão manual.

## 7. Webhooks
- HMAC ou bearer configurável.
- HMAC inclui timestamp e corpo bruto.
- Janela anti-replay padrão: 5 minutos.
- Evento é deduplicado por hash do ID.
- Apenas hashes do payload/evento são persistidos na tabela de controle.
- Webhook não executa cancelamento financeiro automaticamente.

## 8. Rate limit e WAF
O rate limit em memória protege o processo da aplicação, mas não substitui proteção de borda em múltiplas réplicas. Em produção, coloque WAF/CDN reverso na frente do Railway e limite:
- `/api/auth/admin/login`
- `/api/public/session`
- `/api/public/refund-preview`
- `/api/public/cancel`
- `/api/evo/webhook`

Bloqueie padrões de bot, países quando fizer sentido operacional, payloads anormais e picos de requisição.

## 9. Malware e uploads
Upload público está desativado nesta versão. Isso é proposital.

Se comprovantes/anexos forem habilitados depois, o fluxo obrigatório deve ser:
1. aceitar apenas PDF, JPG e PNG;
2. validar extensão, MIME **e magic bytes**;
3. tamanho máximo baixo;
4. nome interno aleatório, nunca usar nome fornecido como caminho;
5. armazenamento privado fora do webroot;
6. status inicial `QUARANTINED`;
7. antivírus/antimalware antes de liberar;
8. rejeitar ZIP, executáveis, HTML, SVG ativo, scripts, documentos com macros;
9. SHA-256 por arquivo;
10. URL assinada de curta duração para download;
11. `Content-Disposition: attachment` e `nosniff`;
12. auditoria de upload, scan, download e exclusão.

## 10. Supply chain
- `npm audit --omit=dev --audit-level=high` no CI.
- Dependabot semanal.
- `npm run security:check` bloqueia referências a segredo em Client Components.
- Gere e comite `package-lock.json` no primeiro `npm install` em máquina com internet.
- Preferir pin de GitHub Actions por SHA completo em ambiente corporativo.
- Ativar Secret Scanning e Push Protection no GitHub.

## 11. Backup e resposta a incidente
- Backup automatizado do PostgreSQL.
- Teste de restauração periódico.
- Logs sem CPF, token, senha, cartão ou API key.
- Alertas de erro EVO, login excessivo, aumento de 4xx/5xx e consumo anormal de API.
- Procedimento de rotação para: EVO token, SESSION_SECRET, peppers e chave de criptografia.
- Em incidente: conter, rotacionar, preservar logs, avaliar impacto LGPD e seguir o procedimento jurídico/encarregado.
