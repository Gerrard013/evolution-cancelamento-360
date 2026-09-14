# Atualizar GitHub e Railway com a v6

Entre no Terminal dentro da pasta extraída `evolution-cancelamento-360-final-v6` e execute:

```bash
SOURCE="$PWD"
TEMP="$HOME/Desktop/evolution-cancelamento-360-push-v6"

rm -rf "$TEMP"
git clone https://github.com/Gerrard013/evolution-cancelamento-360.git "$TEMP"
cd "$TEMP"
git checkout main
git pull origin main

rsync -av --delete \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='.env.local' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.DS_Store' \
  "$SOURCE"/ "$TEMP"/

git add -A
git status
git commit -m "feat: Evolution Cancelamento 360 Final Oficial v6"
git push origin main

git status
git log --oneline -5
```

Não use `git push --force`.

Se o Railway estiver conectado à branch `main`, o novo deploy inicia automaticamente após o push.
