#!/bin/bash
set -euo pipefail

APP_DIR="/home/sprite/app"

# Build
echo "Building..."
bun run build

# Package build output + database
echo "Packaging..."
tar czf /tmp/github-downfall.tar.gz dist/ incidents.db

# Upload tarball via Filesystem API
echo "Uploading..."
sprite api "/fs/write?path=/tmp/deploy.tar.gz" -X PUT \
  --data-binary @/tmp/github-downfall.tar.gz \
  -H "Content-Type: application/octet-stream"

# Extract on sprite
echo "Extracting..."
sprite exec bash -c "mkdir -p $APP_DIR && cd $APP_DIR && rm -rf dist/ && tar xzf /tmp/deploy.tar.gz && rm /tmp/deploy.tar.gz"

# Write start script
echo "Configuring..."
sprite exec bash -c "printf '#!/bin/bash\ncd $APP_DIR\nexec bun dist/server/entry.mjs\n' > $APP_DIR/start.sh && chmod +x $APP_DIR/start.sh"

# (Re)start service
echo "Starting service..."
sprite exec sprite-env services stop server 2>/dev/null || true
sprite exec sprite-env services delete server 2>/dev/null || true
sprite exec sprite-env services create server --cmd "$APP_DIR/start.sh" --http-port 8080
sprite exec sprite-env services start server

rm /tmp/github-downfall.tar.gz

echo "Deployed!"
sprite url
