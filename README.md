# Evolution Cancelamento 360 — Final v3

Sistema web para solicitação, geração do termo, assinatura externa, upload do termo assinado, prévia de estorno, fila administrativa e integração segura com EVO/W12.

## Fluxo real de uso

1. A equipe entra em `/equipe` e pesquisa a matrícula/ID EVO (ex.: `29965`).
2. O backend consulta o EVO, salva somente os dados necessários e identifica a unidade **Condor** ou **Umarizal**.
3. A equipe seleciona o contrato e gera um **ID temporário de acesso**. A matrícula previsível não é usada sozinha no portal público para evitar IDOR/enumeration.
4. O aluno entra em `/cliente`, confirma o contrato, informa motivo/data, vê a prévia financeira quando segura e completa os dados mínimos do termo.
5. O sistema gera o termo em PDF já preenchido e um protocolo único.
6. O aluno baixa, assina e envia o termo assinado (PDF/JPG/PNG, até 8 MB).
7. O arquivo fica privado no PostgreSQL, com hash SHA-256, validação de magic bytes/MIME/tamanho e bloqueio de conteúdo ativo conhecido em PDF.
8. Depois do upload, o pedido vai para análise ou, quando a escrita EVO estiver homologada e habilitada, o backend envia o cancelamento ao EVO com idempotência.
9. A equipe vê o pedido no painel, baixa o termo assinado e acompanha estorno/status/auditoria.

## Por que o aluno não entra apenas com o ID 29965?

IDs numéricos internos normalmente são previsíveis. Usar apenas `29965` como credencial pública permitiria tentativas como `29964`, `29966` etc. O sistema usa o ID EVO **para a equipe localizar o cadastro**, e emite um código temporário aleatório para o aluno. Isso reduz risco de IDOR sem exigir CPF.

Trocar CPF por ID não elimina a LGPD: matrícula/ID vinculável ao aluno continua sendo dado pessoal. O projeto aplica minimização, pseudonimização, criptografia e controle de acesso.

## Termos fornecidos

Os PDFs originais estão preservados em `docs/templates-original/` apenas como referência operacional. A versão digital gerada pelo sistema mantém as condições informadas nos modelos, mas substitui CPF/RG por identificação interna validada pelo sistema. Essa adaptação deve ser aprovada formalmente pela Evolution antes de uso jurídico definitivo.

- Recorrente: referência de multa de R$ 258,00 e antecedência de 30 dias.
- Anual: referência de 14,4% + 10% e prazo informado de até 60 dias úteis para eventual pagamento.

A prévia financeira é deliberadamente tratada como **estimativa**, nunca como autorização automática de estorno.

## Rodar localmente

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:push
npm run dev
```

Acesse:

- Portal público: `http://localhost:3000/cliente`
- Equipe: `http://localhost:3000/equipe/login`
- Healthcheck: `http://localhost:3000/api/health`

## Antes de produção

1. Criar PostgreSQL no Railway e preencher `DATABASE_URL`.
2. Gerar todos os segredos fortes no Railway; nunca commitar `.env`.
3. Configurar `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` e TOTP.
4. Configurar a API EVO primeiro em modo `read`.
5. Confirmar os endpoints reais na documentação/homologação EVO.
6. Testar o ID de um aluno de Condor e de Umarizal.
7. Validar os cálculos com o financeiro.
8. Validar o texto digital do termo com a gestão/jurídico.
9. Só então habilitar `EVO_WRITE_ENABLED=true` e, por último, `CUSTOMER_DIRECT_CANCELLATION=true`.

Leia `docs/FINAL_RUNBOOK.md` e `docs/EVO_CONNECTION_CHECKLIST.md` antes da homologação.
