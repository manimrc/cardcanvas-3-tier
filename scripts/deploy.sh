#!/bin/bash
set -e

# Configuration - Replace these with your VM IPs or set them as ENV vars
BACKEND_IP=${BACKEND_IP:-"<BACKEND_PUBLIC_IP>"}
FRONTEND_IP=${FRONTEND_IP:-"<FRONTEND_PUBLIC_IP>"}
USER="azureuser"

echo "🚀 Starting Deployment to Sleekly Production with Remote Build & Clean..."

# 1. Package Source Codes
echo "📦 Packaging source codes for remote compilation..."
tar --exclude="target" --exclude=".git" -czf backend-src.tar.gz sleekly-backend
tar --exclude=".next" --exclude="node_modules" --exclude=".git" -czf frontend-src.tar.gz sleekly-frontend

# 2. Deploy & Compile Backend on VM
echo "📤 Transferring source to Backend VM ($BACKEND_IP)..."
scp backend-src.tar.gz $USER@$BACKEND_IP:/tmp/
scp deployment/systemd/sleekly-backend.service $USER@$BACKEND_IP:/tmp/

echo "🏗️ Remotely building and cleaning Backend on VM..."
ssh $USER@$BACKEND_IP << 'EOF'
  set -e
  # Stop service if running
  sudo systemctl stop sleekly-backend || true

  # Extract to temporary build directory
  rm -rf /tmp/sleekly-backend-build
  mkdir -p /tmp/sleekly-backend-build
  tar -xzf /tmp/backend-src.tar.gz -C /tmp/sleekly-backend-build --strip-components=1

  # Compile using VM's Rust compiler
  echo "🦀 Running Cargo build --release..."
  cd /tmp/sleekly-backend-build
  ~/.cargo/bin/cargo build --release

  # Create clean production directory
  sudo mkdir -p /var/www/sleekly-backend
  sudo chown -R azureuser:azureuser /var/www/sleekly-backend

  # Copy ONLY the production binary and database migrations
  cp target/release/sleekly-backend /var/www/sleekly-backend/
  cp -r migrations /var/www/sleekly-backend/

  # Install and start Systemd service
  sudo mv /tmp/sleekly-backend.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable sleekly-backend
  sudo systemctl restart sleekly-backend

  # === Get rid of the build junk ===
  echo "🧹 Cleaning up Backend build junk..."
  rm -f /tmp/backend-src.tar.gz
  rm -rf /tmp/sleekly-backend-build
  # Clear cargo registry and git cache to save disk space
  rm -rf ~/.cargo/registry/*
  rm -rf ~/.cargo/git/*
EOF

# 3. Deploy & Compile Frontend on VM
echo "📤 Transferring source to Frontend VM ($FRONTEND_IP)..."
scp frontend-src.tar.gz $USER@$FRONTEND_IP:/tmp/
scp deployment/pm2/ecosystem.config.js $USER@$FRONTEND_IP:/tmp/

# Replace the backend IP placeholder in Nginx config before copying
sed "s/<BACKEND_IP>/$BACKEND_IP/g" deployment/nginx/sleekly.conf > /tmp/sleekly.conf
scp /tmp/sleekly.conf $USER@$FRONTEND_IP:/tmp/sleekly.conf
rm -f /tmp/sleekly.conf

echo "🏗️ Remotely building and cleaning Frontend on VM..."
ssh $USER@$FRONTEND_IP << 'EOF'
  set -e
  # Extract to temporary build directory
  rm -rf /tmp/sleekly-frontend-build
  mkdir -p /tmp/sleekly-frontend-build
  tar -xzf /tmp/frontend-src.tar.gz -C /tmp/sleekly-frontend-build --strip-components=1

  # Install dependencies and build frontend on VM
  echo "⚛️ Running npm install & npm run build..."
  cd /tmp/sleekly-frontend-build
  npm ci
  npm run build

  # Create clean production directory
  sudo mkdir -p /var/www/sleekly-frontend
  sudo chown -R azureuser:azureuser /var/www/sleekly-frontend

  # Copy Next.js standalone runtime assets (ignores source code and large node_modules)
  cp -r .next/standalone/* /var/www/sleekly-frontend/
  cp -r public /var/www/sleekly-frontend/
  cp -r .next/static /var/www/sleekly-frontend/.next/

  # Copy PM2 config
  mv /tmp/ecosystem.config.js /var/www/sleekly-frontend/

  # Set up Nginx
  sudo mv /tmp/sleekly.conf /etc/nginx/sites-available/sleekly
  sudo ln -sf /etc/nginx/sites-available/sleekly /etc/nginx/sites-enabled/
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl restart nginx

  # Start or restart PM2 server
  cd /var/www/sleekly-frontend
  pm2 startOrRestart ecosystem.config.js --update-env

  # === Get rid of the build junk ===
  echo "🧹 Cleaning up Frontend build junk..."
  rm -f /tmp/frontend-src.tar.gz
  rm -rf /tmp/sleekly-frontend-build
  # Clear npm package cache to save space
  npm cache clean --force || true
EOF

# Clean up local archives
rm -f backend-src.tar.gz frontend-src.tar.gz

echo "✅ Deployment and Cleanup Complete!"
