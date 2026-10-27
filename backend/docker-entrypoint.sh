#!/bin/sh
set -e

# Ensure storage directories exist in the mounted volume
mkdir -p /app/storage/pdfs \
         /app/storage/watch \
         /app/storage/reports \
         /app/storage/uploads \
         /app/storage/watch/processed \
         /app/storage/watch/error

# Fix ownership of the storage directory so user atc (10001) has full read/write access
chown -R atc:atc /app/storage 2>/dev/null || true
chmod -R 775 /app/storage 2>/dev/null || true

# Drop root privileges and execute the main container command as user atc
exec gosu atc "$@"
