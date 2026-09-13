# Evolution Cancelamento 360 — Operacional v5

Versão preparada para demonstração e operação assistida na recepção, sem SMTP e sem link/código visível para o aluno.

## Fluxo principal

### Equipe (Gerrard / Ruy)
1. Entrar em `/equipe` com usuário e senha.
2. Digitar a matrícula EVO do aluno, por exemplo `29965`.
3. Com API EVO em `read`, o sistema traz aluno, unidade, plano e contrato automaticamente.
4. Enquanto a API não estiver ligada, o cadastro rápido permite informar esses dados manualmente.
5. Conferir o contrato e clicar **Atender aluno agora**.
6. O sistema cria uma sessão interna segura e abre o formulário do aluno no mesmo aparelho. Nenhum link ou código precisa ser copiado.

### Aluno
1. Confere nome, Condor/Umarizal, plano e contrato.
2. Informa motivo e data desejada.
3. Se for plano anual e houver dados suficientes, vê a prévia de estorno.
4. O cálculo de referência mostra separadamente 14,4% (antecipação das parcelas) + 10% (multa/taxa do sistema), aplicados sobre o saldo proporcional não utilizado, como **estimativa sujeita à conferência financeira**.
5. Preenche endereço e, quando aplicável, chave PIX.
6. Gera e baixa o termo PDF.
7. Assina e envia PDF/JPG/PNG no próprio sistema.
8. Recebe protocolo e o pedido entra na fila administrativa.

## Plano recorrente

O modelo fornecido informa multa de referência de R$ 258,00 e antecedência de 30 dias da próxima mensalidade. Como o documento não fornece fórmula automática segura de estorno para o recorrente, o sistema sinaliza conferência financeira em vez de inventar cálculo.

## Sem SMTP

O sistema não depende de SMTP. O termo é gerado, baixado e depois enviado pelo próprio portal. O documento fica vinculado ao protocolo no PostgreSQL. Caso a Evolution aprove o fluxo digital como procedimento oficial, ele substitui a troca manual de e-mails para esse processo.

## Dois acessos de equipe

Configure no Railway:

```env
ADMIN_1_NAME="Gerrard"
ADMIN_1_USERNAME="gerrard"
ADMIN_1_PASSWORD_HASH="..."
ADMIN_2_NAME="Ruy"
ADMIN_2_USERNAME="ruy"
ADMIN_2_PASSWORD_HASH="..."
```

Gere cada hash localmente:

```bash
npm run admin:hash -- "SENHA-FORTE-COM-14-OU-MAIS-CARACTERES"
```

Não coloque senhas em texto puro no GitHub.

## Railway — variáveis mínimas para demonstrar hoje

```env
DATABASE_URL="${{Postgres.DATABASE_URL}}"
APP_ORIGIN="https://evolution-cancelamento-360-production.up.railway.app"
NEXT_PUBLIC_DEMO_MODE="false"
SESSION_SECRET="..."
PUBLIC_ID_PEPPER="..."
EXTERNAL_ID_PEPPER="..."
APP_DATA_ENCRYPTION_KEY="..."
IP_HASH_PEPPER="..."
ADMIN_1_NAME="Gerrard"
ADMIN_1_USERNAME="gerrard"
ADMIN_1_PASSWORD_HASH="..."
ADMIN_2_NAME="Ruy"
ADMIN_2_USERNAME="ruy"
ADMIN_2_PASSWORD_HASH="..."
EVO_INTEGRATION_MODE="manual"
EVO_WRITE_ENABLED="false"
CUSTOMER_DIRECT_CANCELLATION="false"
```

O container executa `prisma db push` ao iniciar para manter as tabelas necessárias no PostgreSQL do Railway.

## Integração EVO

Para a demonstração, use `manual`. Para integrar dados reais:

1. Configurar token/credencial EVO **somente no Railway**.
2. Mudar para `EVO_INTEGRATION_MODE="read"`.
3. Testar matrícula real, unidade Condor/Umarizal, plano, contrato e valores.
4. Somente após homologar leitura e endpoint oficial de cancelamento, usar `write`.
5. Manter `CUSTOMER_DIRECT_CANCELLATION="false"` no início: a equipe aprova o cancelamento antes de escrever no EVO.

Variáveis esperadas:

```env
EVO_API_BASE_URL="..."
EVO_API_TOKEN="..."
EVO_API_USERNAME="..."
EVO_AUTH_MODE="bearer"
EVO_MEMBER_BY_ID_PATH="..."
EVO_CONTRACTS_BY_MEMBER_PATH="..."
EVO_CONTRACT_BY_ID_PATH="..."
EVO_CANCEL_CONTRACT_PATH="..."
EVO_CANCEL_METHOD="DELETE"
```

Nunca use `NEXT_PUBLIC_` em segredos EVO.

## Verificações

```bash
npm run security:check
npm run production:check
npm run typecheck
npm run build
```
