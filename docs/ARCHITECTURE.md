# Arquitetura — Secure v2

## Fluxos

### Cliente
`ID temporário -> sessão HttpOnly -> contrato -> motivo/data -> termo -> prévia -> protocolo -> EVO opcional -> acompanhamento`

### Equipe
`login + TOTP -> sync por ID EVO -> cache local -> gera ID temporário -> fila -> decisão -> confirmação de cancelamento -> registro de estorno`

## Camadas
1. **Frontend público**: Next.js App Router, sem CPF.
2. **Frontend administrativo**: separado e autenticado.
3. **API interna**: validação Zod, rate limit, origem confiável e sessão.
4. **Domínio**: cancelamento, cálculo, regras, protocolos e auditoria.
5. **Persistência**: PostgreSQL/Prisma.
6. **Integração EVO**: adapter manual/read/write, cache, budget, webhooks.
7. **Borda**: HTTPS + WAF/CDN + Railway.

## Dados sensíveis
- Identificadores EVO: HMAC + AES-256-GCM.
- ID temporário do cliente: apenas hash.
- IP/User-Agent: apenas hash na auditoria.
- Token EVO e segredos: somente ambiente do servidor.

## Falha segura
- EVO fora do ar: pedido continua salvo.
- Endpoint de escrita não configurado: não tenta adivinhar.
- Escrita falha: `MANUAL_REVIEW`.
- Regra financeira ausente: cancelamento continua possível, mas prévia automática não é prometida.
- Upload público: inexistente nesta versão.
