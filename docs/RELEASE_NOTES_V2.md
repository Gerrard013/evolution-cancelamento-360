# Secure v2 — release notes

## Segurança
- segregação portal público / área administrativa;
- senha PBKDF2 + TOTP opcional;
- sessão curta em cookie HttpOnly;
- CSP nonce, HSTS, anti-frame, nosniff;
- origin check + SameSite para CSRF;
- rate limit;
- SSRF hardening no conector EVO;
- token EVO exclusivamente server-side;
- webhook autenticado, anti-replay e idempotente;
- upload público removido.

## Privacidade
- CPF removido do portal e do modelo de dados;
- acesso por ID temporário opaco;
- identificador EVO com hash + criptografia;
- IP/User-Agent armazenados apenas como hash de auditoria.

## Operação
- sync por ID EVO;
- cache e budget de hits;
- prévia de estorno baseada em regra versionada;
- protocolo único;
- escrita EVO protegida por três flags;
- fallback automático para revisão manual;
- registro de decisão e estorno com auditoria.
