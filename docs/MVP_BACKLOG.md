# Backlog funcional com propósito

## Implementado nesta entrega
- Portal cliente por ID temporário, sem CPF.
- Sessão pública segura e contrato derivado da sessão.
- Prévia de estorno calculada no servidor.
- Termo versionado e protocolo único.
- Bloqueio de solicitação duplicada aberta.
- Painel administrativo autenticado.
- Sync por ID/matrícula EVO.
- Geração de ID temporário por contrato.
- Cache e contador de hits EVO.
- Escrita EVO protegida por feature flags.
- Webhook autenticado e idempotente.
- Auditoria de submissão, decisão e estorno.
- Registro administrativo de estorno após cancelamento confirmado.
- Headers de segurança, rate limit e hardening de segredos.
- Pipeline GitHub para build/audit/verificação de segredo.

## Próximos itens somente se houver necessidade real
- SSO/OIDC individual para equipes maiores.
- Redis/rate limit distribuído se houver múltiplas réplicas.
- Storage privado + antivírus para comprovantes, caso o processo exija arquivos.
- Integração de pagamento/estorno somente após API formal e dupla autorização.
- Relatórios PDF/Excel quando a operação tiver volume que justifique.
