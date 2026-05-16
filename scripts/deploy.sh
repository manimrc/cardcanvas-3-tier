#!/bin/bash
set -e

# Configuration - Replace these with your VM IPs or set them as ENV vars
BACKEND_IP=${BACKEND_IP:-"<BACKEND_PUBLIC_IP>"}
FRONTEND_IP=${FRONTEND_IP:-"<FRONTEND_PUBLIC_IP>"}
USER="azureuser"

echo "🚀 Starting Deployment to CardCanvas Production..."

# 1. Build Backend
echo "🦀 Building Rust Backend..."
cd cardcanvas-backend
# Note: In a real CI/CD, we'd use a cross-compiler or a Linux build agent
cargo build --release
cd ..

# 2. Build Frontend
echo "⚛️ Building Next.js Frontend..."
cd cardcanvas-v3
npm install
npm run build
# Create standalone bundle
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
cd ..

# 3. Deploy Backend
echo "📤 Deploying Backend to $BACKEND_IP..."
scp cardcanvas-backend/target/release/cardcanvas-backend $USER@$BACKEND_IP:/var/www/cardcanvas-backend/
scp -r cardcanvas-backend/migrations $USER@$BACKEND_IP:/var/www/cardcanvas-backend/
scp deployment/systemd/cardcanvas-backend.service $USER@$BACKEND_IP:/tmp/
ssh $USER@$BACKEND_IP "sudo mv /tmp/cardcanvas-backend.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl restart cardcanvas-backend"

# 4. Deploy Frontend
echo "📤 Deploying Frontend to $FRONTEND_IP..."
cd cardcanvas-v3/.next/standalone
tar -czf ../../../frontend.tar.gz .
cd ../../..
scp frontend.tar.gz $USER@$FRONTEND_IP:/tmp/
scp deployment/nginx/cardcanvas.conf $USER@$FRONTEND_IP:/tmp/
scp deployment/pm2/ecosystem.config.js $USER@$FRONTEND_IP:/var/www/cardcanvas-frontend/

ssh $USER@$FRONTEND_IP << EOF
  sudo tar -xzf /tmp/frontend.tar.gz -C /var/www/cardcanvas-frontend
  sudo mv /tmp/cardcanvas.conf /etc/nginx/sites-available/cardcanvas
  sudo ln -sf /etc/nginx/sites-available/cardcanvas /etc/nginx/sites-enabled/
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo nginx -t && sudo systemctl restart nginx
  cd /var/www/cardcanvas-frontend && pm2 startOrRestart ecosystem.config.js --update-env
EOF

echo "✅ Deployment Complete!"
