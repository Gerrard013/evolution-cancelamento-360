# Deploy no Railway — v6

## Serviços

O projeto deve ter:
- `Postgres` Online;
- `evolution-cancelamento-360` conectado ao GitHub.

## Variável crítica do banco

No serviço **evolution-cancelamento-360**, não no Postgres:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
```

Sem essa referência o Prisma encerra com `P1012 Environment variable not found: DATABASE_URL`.

## Segredos

Gere localmente:

```bash
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 48
openssl rand -base64 32
```

Use os quatro primeiros para `SESSION_SECRET`, `PUBLIC_ID_PEPPER`, `EXTERNAL_ID_PEPPER`, `IP_HASH_PEPPER` e o último para `APP_DATA_ENCRYPTION_KEY`.

## Administradores

```bash
npm run admin:hash -- "SENHA-FORTE-COM-14-OU-MAIS-CARACTERES"
```

Configure `ADMIN_1_*` para Gerrard e `ADMIN_2_*` para Ruy. Não coloque senha em texto puro.

## Banco

O container inicia com:

```bash
npx prisma db push && node server.js
```

Em uma evolução futura de produção, substitua `db push` por migrations versionadas.

## Depois do deploy

1. confirmar Deployment Active;
2. abrir `/api/health`;
3. testar login da equipe;
4. configurar EVO `read`;
5. testar portal com uma matrícula conhecida;
6. só então homologar escrita.
