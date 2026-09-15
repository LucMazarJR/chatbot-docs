---
name: backup
description: "Gera tar.gz do repositorio chatbot-docs sem .env. Use para backup ou copia de seguranca."
---

# Skill: backup

Não existe `scripts/backup.sh` neste repo. Compactar na hora.

## Destino

`BACKUP_ROOT` se definido. Senão: `/mnt/e/VSCode-bkp/chatbot-docs` → `/mnt/f/VS-WSL-Backup/chatbot-docs` → `$HOME/backups/chatbot-docs`.

## Comando

```bash
DEST="${BACKUP_ROOT:-/mnt/e/VSCode-bkp/chatbot-docs}"
mkdir -p "$DEST"
STAMP=$(date +%Y%m%d_%H%M%S)
tar -czf "$DEST/chatbot-docs_$STAMP.tar.gz" \
  --exclude=.env --exclude=.env.* --exclude=node_modules \
  --exclude=.next --exclude=Dashboard-PetSaude \
  --exclude=scripts/backups --exclude=.git \
  -C "$(git rev-parse --show-toplevel)/.." chatbot-docs
sha256sum "$DEST/chatbot-docs_$STAMP.tar.gz"
```

Para incluir `.git` (histórico), tire `--exclude=.git`. Nunca incluir `.env`.

Resposta: caminho + checksum. Commit/push só se o usuário pediu antes.
