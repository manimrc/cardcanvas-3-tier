#!/bin/bash
set -e

# Configuration - Replace these with your VM IPs or set them as ENV vars
BACKEND_IP=${BACKEND_IP:-"<BACKEND_PUBLIC_IP>"}
FRONTEND_IP=${FRONTEND_IP:-"<FRONTEND_PUBLIC_IP>"}
USER="azureuser"

echo "🚀 Starting Deployment to CardCanvas Production with Remote Build & Clean..."

# 1. Package Source Codes
echo "📦 Packaging source codes for remote compilation..."
tar --exclude="target" --exclude=".git" -czf backend-src.tar.gz cardcanvas-backend
tar --exclude=".next" --exclude="node_modules" --exclude=".git" -czf frontend-src.tar.gz cardcanvas-frontend

# 2. Deploy & Compile Backend on VM
echo "📤 Transferring source to Backend VM ($BACKEND_IP)..."
scp backend-src.tar.gz $USER@$BACKEND_IP:/tmp/
scp deployment/systemd/cardcanvas-backend.service $USER@$BACKEND_IP:/tmp/

echo "🏗️ Remotely building and cleaning Backend on VM..."
ssh $USER@$BACKEND_IP << 'EOF'
  set -e
  # Stop service if running
  sudo systemctl stop cardcanvas-backend || true

  # Extract to temporary build directory
  rm -rf /tmp/cardcanvas-backend-build
  mkdir -p /tmp/cardcanvas-backend-build
  tar -xzf /tmp/backend-src.tar.gz -C /tmp/cardcanvas-backend-build --strip-components=1

  # Compile using VM's Rust compiler
  echo "🦀 Running Cargo build --release..."
  cd /tmp/cardcanvas-backend-build
  ~/.cargo/bin/cargo build --release

  # Create clean production directory
  sudo mkdir -p /var/www/cardcanvas-backend
  sudo chown -R azureuser:azureuser /var/www/cardcanvas-backend

  # Copy ONLY the production binary and database migrations
  cp target/release/cardcanvas-backend /var/www/cardcanvas-backend/
  cp -r migrations /var/www/cardcanvas-backend/

  # Install and start Systemd service
  sudo mv /tmp/cardcanvas-backend.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable cardcanvas-backend
  sudo systemctl restart cardcanvas-backend

  # === Get rid of the build junk ===
  echo "🧹 Cleaning up Backend build junk..."
  rm -f /tmp/backend-src.tar.gz
  rm -rf /tmp/cardcanvas-backend-build
  # Clear cargo registry and git cache to save disk space
  rm -rf ~/.cargo/registry/*
  rm -rf ~/.cargo/git/*
EOF

# 3. Deploy & Compile Frontend on VM
echo "📤 Transferring source to Frontend VM ($FRONTEND_IP)..."
scp frontend-src.tar.gz $USER@$FRONTEND_IP:/tmp/
scp deployment/pm2/ecosystem.config.js $USER@$FRONTEND_IP:/tmp/

# Replace the backend IP placeholder in Nginx config before copying
sed "s/<BACKEND_IP>/$BACKEND_IP/g" deployment/nginx/cardcanvas.conf > /tmp/cardcanvas.conf
scp /tmp/cardcanvas.conf $USER@$FRONTEND_IP:/tmp/cardcanvas.conf
rm -f /tmp/cardcanvas.conf

echo "🏗️ Remotely building and cleaning Frontend on VM..."
ssh $USER@$FRONTEND_IP << 'EOF'
  set -e
  # Extract to temporary build directory
  rm -rf /tmp/cardcanvas-frontend-build
  mkdir -p /tmp/cardcanvas-frontend-build
  tar -xzf /tmp/frontend-src.tar.gz -C /tmp/cardcanvas-frontend-build --strip-components=1

  # Install dependencies and build frontend on VM
  echo "⚛️ Running npm install & npm run build..."
  cd /tmp/cardcanvas-frontend-build
  npm ci
  npm run build

  # Create clean production directory
  sudo mkdir -p /var/www/cardcanvas-frontend
  sudo chown -R azureuser:azureuser /var/www/cardcanvas-frontend

  # Copy Next.js standalone runtime assets (ignores source code and large node_modules)
  cp -r .next/standalone/* /var/www/cardcanvas-frontend/
  cp -r public /var/www/cardcanvas-frontend/
  cp -r .next/static /var/www/cardcanvas-frontend/.next/

  # Copy PM2 config
  mv /tmp/ecosystem.config.js /var/www/cardcanvas-frontend/

  # Set up Nginx
  sudo mv /tmp/cardcanvas.conf /etc/nginx/sites-available/cardcanvas
  sudo ln -sf /etc/nginx/sites-available/cardcanvas /etc/nginx/sites-enabled/
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl restart nginx

  # Start or restart PM2 server
  cd /var/www/cardcanvas-frontend
  pm2 startOrRestart ecosystem.config.js --update-env

  # === Get rid of the build junk ===
  echo "🧹 Cleaning up Frontend build junk..."
  rm -f /tmp/frontend-src.tar.gz
  rm -rf /tmp/cardcanvas-frontend-build
  # Clear npm package cache to save space
  npm cache clean --force || true
EOF

# Clean up local archives
rm -f backend-src.tar.gz frontend-src.tar.gz

echo "✅ Deployment and Cleanup Complete!"
