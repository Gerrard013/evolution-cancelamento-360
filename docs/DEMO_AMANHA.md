# Checklist da demonstração para o Ruy

## Antes da reunião
- Railway: Postgres Online.
- Serviço Evolution 360: Deployment Active.
- `DATABASE_URL` referenciando Postgres.
- Segredos de aplicação configurados.
- Duas contas administrativas configuradas.
- `EVO_INTEGRATION_MODE=manual` enquanto a API real não estiver homologada.
- `EVO_WRITE_ENABLED=false`.
- `CUSTOMER_DIRECT_CANCELLATION=false`.

## Roteiro de demonstração
1. Abrir `/equipe` e entrar com Gerrard ou Ruy.
2. Digitar uma matrícula de teste.
3. Enquanto API não estiver conectada, preencher cadastro rápido: nome, Condor/Umarizal, plano, tipo, datas e valor.
4. Clicar **Atender aluno agora**.
5. Mostrar contrato ao aluno.
6. Informar motivo e data.
7. Se anual, mostrar prévia: saldo não utilizado, 14,4%, 10% e estimativa de estorno.
8. Gerar PDF do termo.
9. Fazer upload de um termo assinado de teste.
10. Mostrar protocolo e retorno à central.
11. Mostrar fila do painel e status.

## Mensagem comercial
"O sistema centraliza o cancelamento, elimina a dependência de e-mails perdidos, gera protocolo e termo, organiza o documento assinado e prepara a integração com o EVO. O cálculo anual apresenta uma prévia com a regra operacional informada e a escrita no EVO só é liberada depois da homologação, evitando cancelamentos indevidos."
