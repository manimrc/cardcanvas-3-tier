#!/bin/bash
set -e

# Load application secrets (e.g. DB credentials)
if [ -f "/var/www/cardcanvas-backend/.env" ]; then
    source /var/www/cardcanvas-backend/.env
elif [ -f "./.env" ]; then
    source ./.env
fi

# Ensure mandatory variables are set
DB_HOST=${DB_HOST:-"localhost"}
DB_PORT=${DB_PORT:-"5432"}
DB_USER=${DB_USER:-"postgres"}
DB_PASSWORD=${DB_PASSWORD:-"postgres"}
DB_NAME=${DB_NAME:-"cardcanvas"}
STORAGE_ACCOUNT=${STORAGE_ACCOUNT:-"stcardcanvasprod"}
BLOB_CONTAINER=${BLOB_CONTAINER:-"cardcanvas-backups"}

TIMESTAMP=$(date +%F_%H-%M-%S)
BACKUP_DIR="/var/backups/cardcanvas"
LOG_FILE="/var/log/cardcanvas-backend/backup.log"

# Ensure directories exist
mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date)] Starting secure backup procedure..." >> "$LOG_FILE"

# 1. Execute SQL dump
DB_DUMP="$BACKUP_DIR/db_$TIMESTAMP.sql"
echo "[$(date)] Creating database dump..." >> "$LOG_FILE"
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F p -f "$DB_DUMP"

# 2. Package user uploaded files
UPLOADS_TAR="$BACKUP_DIR/uploads_$TIMESTAMP.tar.gz"
if [ -d "/var/www/cardcanvas-backend/uploads" ]; then
    echo "[$(date)] Packaging user uploads..." >> "$LOG_FILE"
    tar -czf "$UPLOADS_TAR" -C "/var/www/cardcanvas-backend/uploads" .
else
    echo "[$(date)] Uploads folder not found, skipping packaging." >> "$LOG_FILE"
    UPLOADS_TAR=""
fi

# 3. Log in to Azure using System-Assigned Managed Identity on the VM
echo "[$(date)] Authenticating with Azure MSI..." >> "$LOG_FILE"
if az login --identity --allow-no-subscriptions > /dev/null 2>&1; then
    echo "[$(date)] Successfully logged in via MSI." >> "$LOG_FILE"
else
    echo "[$(date)] WARNING: MSI login failed, attempting connection string fallback if set..." >> "$LOG_FILE"
fi

# 4. Upload database dump and uploads to Azure Storage Blob Container
echo "[$(date)] Uploading database dump to storage account $STORAGE_ACCOUNT..." >> "$LOG_FILE"
if az storage blob upload \
  --account-name "$STORAGE_ACCOUNT" \
  --container-name "$BLOB_CONTAINER" \
  --file "$DB_DUMP" \
  --name "db/db_$TIMESTAMP.sql" \
  --auth-mode login >> "$LOG_FILE" 2>&1; then
    echo "[$(date)] Database dump uploaded successfully." >> "$LOG_FILE"
else
    echo "[$(date)] ERROR: Database dump upload failed!" >> "$LOG_FILE"
    exit 1
fi

if [ -n "$UPLOADS_TAR" ] && [ -f "$UPLOADS_TAR" ]; then
  echo "[$(date)] Uploading user uploads archive..." >> "$LOG_FILE"
  if az storage blob upload \
    --account-name "$STORAGE_ACCOUNT" \
    --container-name "$BLOB_CONTAINER" \
    --file "$UPLOADS_TAR" \
    --name "uploads/uploads_$TIMESTAMP.tar.gz" \
    --auth-mode login >> "$LOG_FILE" 2>&1; then
      echo "[$(date)] Uploads archive uploaded successfully." >> "$LOG_FILE"
  else
      echo "[$(date)] ERROR: Uploads archive upload failed!" >> "$LOG_FILE"
      exit 1
  fi
fi

# 5. Clean up local temporary files
rm -f "$DB_DUMP" "$UPLOADS_TAR"
echo "[$(date)] Off-VM backups completed successfully." >> "$LOG_FILE"
echo "--------------------------------------------------------" >> "$LOG_FILE"
