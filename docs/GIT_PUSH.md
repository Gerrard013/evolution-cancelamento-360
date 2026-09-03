# Git push — repositório oficial

Repositório identificado no projeto:
`https://github.com/Gerrard013/evolution-cancelamento-360.git`

Depois de substituir/atualizar os arquivos no seu clone local:

```bash
cd ~/Desktop/evolution-cancelamento-360-ultra-mvp

npm install
npm run security:check
npm run typecheck
npm run build

git status
git add .
git commit -m "feat: secure v2 EVO integration LGPD hardening"
git branch -M main
git remote set-url origin https://github.com/Gerrard013/evolution-cancelamento-360.git
git push -u origin main
```

O `npm install` cria/atualiza `package-lock.json`; comite esse arquivo junto para travar dependências.

Nunca faça `git add .env`. Os segredos ficam no Railway.
