# Deploy seguro no Railway

## 1. Banco
Adicione PostgreSQL ao projeto e use a `DATABASE_URL` fornecida pelo Railway.

## 2. Variáveis obrigatórias
Configure no serviço web:
- `APP_ORIGIN=https://SEU-DOMINIO`
- `NEXT_PUBLIC_DEMO_MODE=false`
- `SESSION_SECRET`
- `PUBLIC_ID_PEPPER`
- `EXTERNAL_ID_PEPPER`
- `IP_HASH_PEPPER`
- `APP_DATA_ENCRYPTION_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_TOTP_SECRET`

Depois adicione as variáveis EVO quando a integração for homologada.

## 3. Gerar segredos
Exemplos no Mac/Linux:
```bash
openssl rand -base64 48
openssl rand -base64 32
```

Para a chave AES, use exatamente 32 bytes codificados em Base64:
```bash
openssl rand -base64 32
```

Hash de senha administrativa:
```bash
npm run admin:hash -- "SUA-SENHA-FORTE"
```

## 4. Banco/schema
Antes do piloto:
```bash
npm install
npx prisma generate
npx prisma db push
```

Para produção madura, prefira migrations versionadas em vez de `db push`.

## 5. Healthcheck
Use `/api/health`.

## 6. Domínio e borda
- domínio HTTPS próprio;
- WAF/CDN reverso;
- rate limit de borda;
- bloqueio de bots;
- logs e alertas;
- backups.

## 7. Não fazer
- não cadastrar `EVO_API_TOKEN` em variável `NEXT_PUBLIC_*`;
- não colocar token no código;
- não colocar `.env` no GitHub;
- não ativar escrita EVO antes de teste em homologação;
- não deixar `NEXT_PUBLIC_DEMO_MODE=true` em produção.
