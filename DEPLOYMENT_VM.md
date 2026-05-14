# CardCanvas Bare-Metal VM Deployment Guide (Azure)

This guide walks you through deploying the CardCanvas 3-tier architecture on native Linux VMs (without Docker) using Nginx, PM2, and systemd.

## Architecture
- **Frontend VM**: Runs Next.js via Node.js + PM2, proxying traffic through Nginx. (Azure `Standard_B1s`)
- **Backend VM**: Runs the compiled Rust Axum binary as a Systemd service. (Azure `Standard_B2s`)
- **Database**: Azure PostgreSQL Flexible Server (Managed Database)

---

## Step 1: Provision Infrastructure

1. Generate an SSH key if you don't have one:
   ```bash
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa
   ```
2. Apply the Terraform configuration:
   ```bash
   cd infrastructure-vm
   terraform init
   terraform apply
   ```
   *Note the outputs: `frontend_public_ip`, `backend_public_ip`, and `database_fqdn`.*

---

## Step 2: Deploy the Rust Backend

Since Rust is a compiled language, you can build the binary locally and simply transfer it to the VM.

1. **Build the binary locally** for the Linux target:
   ```bash
   cd cardcanvas-backend
   # You may need `cargo install cross` if you are building from macOS/Windows to target Linux
   # cross build --release --target x86_64-unknown-linux-gnu
   cargo build --release
   ```
   *(Alternatively, copy the source code to the backend VM and run `cargo build --release` there).*

2. **Upload the binary and migrations** to the Backend VM:
   ```bash
   scp -r target/release/cardcanvas-backend migrations/ azureuser@<BACKEND_PUBLIC_IP>:/var/www/cardcanvas-backend/
   ```

3. **Run database migrations**:
   SSH into the Backend VM:
   ```bash
   ssh azureuser@<BACKEND_PUBLIC_IP>
   psql -h <DATABASE_FQDN> -U ccadmin -d cardcanvas -W < migrations/init.sql
   ```

4. **Create a Systemd Service** for the backend:
   ```bash
   sudo nano /etc/systemd/system/cardcanvas-backend.service
   ```
   Add the following content:
   ```ini
   [Unit]
   Description=CardCanvas Rust Backend
   After=network.target

   [Service]
   User=azureuser
   WorkingDirectory=/var/www/cardcanvas-backend
   ExecStart=/var/www/cardcanvas-backend/cardcanvas-backend
   Restart=always
   Environment="PORT=8080"
   Environment="FRONTEND_URL=http://<FRONTEND_PUBLIC_IP>"
   Environment="DATABASE_URL=postgres://ccadmin:SecurePassword123!@<DATABASE_FQDN>:5432/cardcanvas?sslmode=require"
   Environment="JWT_SECRET=your_super_secret_jwt_key_here"
   Environment="MEDIA_DIR=/var/www/cardcanvas-backend/uploads"

   [Install]
   WantedBy=multi-user.target
   ```

5. **Start the backend service**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable cardcanvas-backend
   sudo systemctl start cardcanvas-backend
   sudo systemctl status cardcanvas-backend
   ```

---

## Step 3: Deploy the Next.js Frontend

1. **Update Next.js API URL**:
   In `cardcanvas-v3/.env.local` (create it if missing), set:
   ```env
   NEXT_PUBLIC_API_URL=http://<BACKEND_PUBLIC_IP>:8080
   ```

2. **Build the frontend locally**:
   ```bash
   cd cardcanvas-v3
   npm install
   npm run build
   ```

3. **Upload the build to the Frontend VM**:
   Next.js `output: 'standalone'` creates a standalone server.
   ```bash
   # Create a tarball of the standalone app
   cd .next/standalone
   cp -r ../../public ./public
   cp -r ../static ./.next/static
   tar -czf frontend.tar.gz .
   
   # Transfer to VM
   scp frontend.tar.gz azureuser@<FRONTEND_PUBLIC_IP>:~/
   ```

4. **Run with PM2 on the Frontend VM**:
   SSH into the Frontend VM:
   ```bash
   ssh azureuser@<FRONTEND_PUBLIC_IP>
   mkdir -p /var/www/cardcanvas-frontend
   tar -xzf frontend.tar.gz -C /var/www/cardcanvas-frontend
   cd /var/www/cardcanvas-frontend
   
   # Start the app using PM2
   pm2 start server.js --name "cardcanvas-frontend"
   pm2 save
   pm2 startup
   ```

5. **Configure Nginx as a Reverse Proxy**:
   ```bash
   sudo nano /etc/nginx/sites-available/cardcanvas
   ```
   Add the following content:
   ```nginx
   server {
       listen 80;
       server_name _; # Or your domain name

       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```
   Enable the site and restart Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/cardcanvas /etc/nginx/sites-enabled/
   sudo rm /etc/nginx/sites-enabled/default
   sudo nginx -t
   sudo systemctl restart nginx
   ```

---

## Step 4: Verify Deployment

Open your browser and navigate to `http://<FRONTEND_PUBLIC_IP>`. You should see CardCanvas running!

The Frontend Next.js app communicates directly with the Backend over HTTP (`http://<BACKEND_PUBLIC_IP>:8080`), and the backend persists data safely to the Azure PostgreSQL Flexible Server.
