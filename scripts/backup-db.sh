#!/usr/bin/env bash
# Consistent online backup of the SQLite database (safe while the server runs). Keeps the last 14 backups.
# Cron example:  30 3 * * * /path/to/scripts/backup-db.sh >> /var/log/treadfront-backup.log 2>&1
set -euo pipefail
DB="${DB_PATH:-$(dirname "$0")/../data/treadfront.db}"
OUT="${BACKUP_DIR:-$(dirname "$0")/../backups}"
mkdir -p "$OUT"
FILE="$OUT/treadfront-$(date +%Y%m%d-%H%M%S).db"
node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync(process.argv[1]);d.exec(\"VACUUM INTO '\"+process.argv[2]+\"'\");" "$DB" "$FILE"
gzip "$FILE"
ls -1t "$OUT"/treadfront-*.db.gz | tail -n +15 | xargs -r rm --
echo "backup ok: $FILE.gz"
