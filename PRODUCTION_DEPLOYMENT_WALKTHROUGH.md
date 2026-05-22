# 🏛 Production Deployment Walkthrough: Manual VM & Managed Database Path

This runbook provides the exact, granular, step-by-step instructions to manually deploy **CardCanvas** on Azure (or any cloud provider) using:
- **1 Frontend VM** (Ubuntu 22.04 LTS) for serving Next.js and handling SSL termination.
- **1 Backend VM** (Ubuntu 22.04 LTS) for the Rust Axum API service.
- **1 Managed PostgreSQL Flexible Server** for database storage.

Follow these steps in order to ensure a successful, failure-proof deployment.

---

## 🔗 1. The Connectivity & Security Map

Before provisioning resources, visualize how the traffic flows:
1.  **User Browser ➔ Frontend VM (Ports 80/443)**: HTTPS requests hit Nginx.
    - Path `/` routes to the Next.js standalone server running locally on `localhost:3000`.
    - Path `/api/*` proxies directly to the Backend VM's IP address on port `8080`.
2.  **Backend VM ➔ Managed Database (Port 5432)**: The Axum API connects via private DNS/IP endpoint using a secure connection string (`sslmode=require`).
3.  **Firewall Rules (Network Security Groups)**:
    - **Frontend VM**: Inbound rules must allow **SSH (22)**, **HTTP (80)**, and **HTTPS (443)** from any IP (`*`).
    - **Backend VM**: Inbound rules must allow **SSH (22)** from any IP, and **Custom TCP (8080)** restricted to the **Frontend VM's Public/Private IP** for security.
    - **PostgreSQL Database**: Networking settings must allow inbound traffic on port **5432** whitelisting the **Backend VM's IP address** (or virtual network subnet delegation).

---

## 🏗 2. Managed PostgreSQL Setup (Azure Portal)

Managed Azure PostgreSQL Flexible Servers require whitelisting and proper schema initialization to prevent database connection failures.

1.  **Create Server**:
    - Search for **Azure Database for PostgreSQL flexible servers** in the portal.
    - **Resource Group**: `rg-cardcanvas-prod`.
    - **Server name**: `psql-cardcanvas-prod`.
    - **Compute + storage**: Burstable, `B1ms` (1 vCPU, 2GB RAM—cost-effective for starting).
    - **PostgreSQL version**: `16`.
    - **Authentication**: PostgreSQL authentication only. Set username to `ccadmin` and choose a secure password.
2.  **Networking & Firewall Configuration**:
    - Under **Networking**, choose **Public access (allowed IP addresses)** (or deploy inside a VNet subnet delegation if using private DNS zone links).
    - Check the box for **Allow public access from any Azure service within Azure to this server** (required for VM-to-DB connectivity inside Azure).
    - Add your **Local Development IP address** to the whitelist so you can seed the database schemas.
3.  **Enable Extensions**:
    - In the Left Sidebar under **Settings**, select **Server parameters**.
    - Search for `azure.extensions` and verify or add `UUID-OSSP` to the list. Click **Save**.
4.  **Database & Schema Seeding**:
    - From your local terminal, connect to PostgreSQL (replace `<FQDN>` with your Server Name endpoint):
      ```bash
      psql -h <DATABASE_FQDN> -U ccadmin -d postgres
      ```
    - Create the production database:
      ```sql
      CREATE DATABASE cardcanvas;
      \q
      ```
    - Apply the initial schemas and the daily journal migration in sequence:
      ```bash
      psql -h <DATABASE_FQDN> -U ccadmin -d cardcanvas -f cardcanvas-backend/migrations/20240101000000_init.sql
      psql -h <DATABASE_FQDN> -U ccadmin -d cardcanvas -f cardcanvas-backend/migrations/20240102000000_journal.sql
      ```

---

## 🖥 3. Backend VM Setup & Optimization

Compiling Rust applications on resource-constrained VMs (like a 1GB Standard_B1s or 2GB Standard_B1ms) can trigger the OS Out-Of-Memory (OOM) killer and terminate your compilation. Adding virtual memory (Swap space) is mandatory.

### 3.1. Provision & Configure OS
1.  **Provision VM**: Create a Virtual Machine named `vm-backend` running **Ubuntu Server 22.04 LTS**.
2.  **SSH**: Connect to the VM:
    ```bash
    ssh azureuser@<BACKEND_PUBLIC_IP>
    ```
3.  **Create 2GB SWAP File (Crucial for OOM Prevention)**:
    ```bash
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    # Verify swap is active
    free -h
    ```
4.  **Install OS Packages**:
    ```bash
    sudo apt update && sudo apt upgrade -y
    sudo apt install -y build-essential libssl-dev pkg-config postgresql-client
    ```
5.  **Install Rust Toolchain**:
    ```bash
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    ```

### 3.2. Code Deployment & Systemd Service
1.  **Transfer Source Code**: From your local workspace, package and transfer the backend:
    ```bash
    tar --exclude="target" --exclude=".git" -czf backend-src.tar.gz cardcanvas-backend
    scp backend-src.tar.gz azureuser@<BACKEND_PUBLIC_IP>:/tmp/
    ```
2.  **Compile & Deploy**: On the VM, extract and compile:
    ```bash
    mkdir -p /tmp/cc-backend-build
    tar -xzf /tmp/backend-src.tar.gz -C /tmp/cc-backend-build --strip-components=1
    cd /tmp/cc-backend-build
    cargo build --release
    strip target/release/cardcanvas-backend
    
    # Establish production paths
    sudo mkdir -p /var/www/cardcanvas-backend
    sudo chown -R azureuser:azureuser /var/www/cardcanvas-backend
    cp target/release/cardcanvas-backend /var/www/cardcanvas-backend/
    cp -r migrations /var/www/cardcanvas-backend/
    ```
3.  **Environment Configuration**:
    Create `/var/www/cardcanvas-backend/.env` with secure credentials:
    ```ini
    DATABASE_URL=postgres://ccadmin:<DB_PASSWORD>@<DATABASE_FQDN>:5432/cardcanvas?sslmode=require
    JWT_SECRET=YOUR_VERY_SECURE_LONG_JWT_SECRET_KEY
    PORT=8080
    ```
    Set strict file permissions so other users cannot read your secrets:
    ```bash
    chmod 600 /var/www/cardcanvas-backend/.env
    ```
4.  **Configure Systemd Logging Directories**:
    Create the log folder required by the service definition (without this, systemd will fail to start):
    ```bash
    sudo mkdir -p /var/log/cardcanvas-backend
    sudo chown -R azureuser:azureuser /var/log/cardcanvas-backend
    ```
5.  **Start the Service**:
    Create the systemd service file `/etc/systemd/system/cardcanvas-backend.service`:
    ```ini
    [Unit]
    Description=CardCanvas Rust Backend API Service
    After=network.target

    [Service]
    User=azureuser
    Group=azureuser
    WorkingDirectory=/var/www/cardcanvas-backend
    EnvironmentFile=/var/www/cardcanvas-backend/.env
    ExecStart=/var/www/cardcanvas-backend/cardcanvas-backend
    Restart=always
    RestartSec=5
    StandardOutput=append:/var/log/cardcanvas-backend/out.log
    StandardError=append:/var/log/cardcanvas-backend/err.log

    [Install]
    WantedBy=multi-user.target
    ```
    Enable and launch the service:
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable cardcanvas-backend
    sudo systemctl start cardcanvas-backend
    # Check status
    sudo systemctl status cardcanvas-backend
    ```

---

## ⚛️ 4. Frontend VM Setup & Proxy Configuration

Like the backend VM, the frontend VM must have a Swap file initialized to avoid Next.js build memory errors. Additionally, environment variables prefixed with `NEXT_PUBLIC_` are baked statically into JS files during build-time, meaning they must be present *during* `npm run build`.

### 4.1. Provision & Configure OS
1.  **Provision VM**: Create a VM named `vm-frontend` running **Ubuntu Server 22.04 LTS**.
2.  **SSH**: Connect to the VM:
    ```bash
    ssh azureuser@<FRONTEND_PUBLIC_IP>
    ```
3.  **Create 2GB SWAP File**:
    ```bash
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    ```
4.  **Install Node.js & Nginx**:
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs nginx certbot python3-certbot-nginx
    ```
5.  **Install PM2 Process Manager Globally**:
    ```bash
    sudo npm install -g pm2
    ```

### 4.2. Next.js Static Build & PM2 Deployment
1.  **Transfer Source Code**: Package and transfer the frontend directory:
    ```bash
    tar --exclude=".next" --exclude="node_modules" --exclude=".git" -czf frontend-src.tar.gz cardcanvas-frontend
    scp frontend-src.tar.gz azureuser@<FRONTEND_PUBLIC_IP>:/tmp/
    ```
2.  **Build Code on VM**:
    ```bash
    mkdir -p /tmp/cc-frontend-build
    tar -xzf /tmp/frontend-src.tar.gz -C /tmp/cc-frontend-build --strip-components=1
    cd /tmp/cc-frontend-build
    
    # Configure environmental API endpoint BEFORE building (baked into JS)
    echo "NEXT_PUBLIC_API_URL=http://<BACKEND_PUBLIC_IP>:8080" > .env.production
    
    # Clean install and build
    npm ci
    npm run build
    ```
3.  **Establish Production Assets**:
    Copy only the Next.js standalone runtime assets (which exclude original source code and large node_modules directories):
    ```bash
    sudo mkdir -p /var/www/cardcanvas-frontend
    sudo chown -R azureuser:azureuser /var/www/cardcanvas-frontend
    
    cp -r .next/standalone/* /var/www/cardcanvas-frontend/
    cp -r public /var/www/cardcanvas-frontend/
    cp -r .next/static /var/www/cardcanvas-frontend/.next/
    ```
4.  **Deploy PM2 Process Runner**:
    Create `/var/www/cardcanvas-frontend/ecosystem.config.js`:
    ```javascript
    module.exports = {
      apps: [
        {
          name: 'cardcanvas-frontend',
          script: 'server.js',
          cwd: '/var/www/cardcanvas-frontend',
          instances: 'max',
          exec_mode: 'cluster',
          env: {
            NODE_ENV: 'production',
            PORT: 3000,
          },
        },
      ],
    };
    ```
    Start and register PM2 to run on VM startup:
    ```bash
    cd /var/www/cardcanvas-frontend
    pm2 start ecosystem.config.js
    pm2 startup
    # Note: Copy and run the command printed by 'pm2 startup' to authorize systemd integration
    pm2 save
    ```

---

## 🌐 5. Nginx Reverse Proxy & SSL Setup

1.  **Configure Nginx**:
    Create `/etc/nginx/sites-available/cardcanvas` (replace `<BACKEND_PUBLIC_IP>` with the backend VM IP):
    ```nginx
    server {
        listen 80;
        server_name _; # Replace with your custom domain (e.g. cardcanvas.com)

        gzip on;
        gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

        # Proxy API calls directly to the Backend VM
        location /api/ {
            proxy_pass http://<BACKEND_PUBLIC_IP>:8080/api/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        # Route page views to local Next.js node instance
        location / {
            proxy_pass http://localhost:3000;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }
    }
    ```
2.  **Enable Configuration**:
    ```bash
    sudo ln -sf /etc/nginx/sites-available/cardcanvas /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default
    
    # Test Nginx syntax
    sudo nginx -t
    
    # Restart server
    sudo systemctl restart nginx
    ```
3.  **Acquire Let's Encrypt SSL Certificate**:
    Once your custom domain's DNS is pointing to the Frontend VM's Public IP, secure the traffic using HTTPS:
    ```bash
    sudo certbot --nginx -d cardcanvas.com -d www.cardcanvas.com
    # Verify automated renewal is active
    sudo systemctl status certbot.timer
    ```

---

## 🆘 6. VM Troubleshooting Checklist

### Q: PM2 shows "Errored" or loop restarts.
**A**: Ensure you copied the `.next/static` and `public` folders to `/var/www/cardcanvas-frontend/`. Run `pm2 logs cardcanvas-frontend` to see specific Node.js stack traces.

### Q: Nginx serves 502 Bad Gateway.
**A**: This means Nginx is running, but the targeted upstream service is down.
- If it fails on `/api/` calls, check if the Rust backend is running: `sudo systemctl status cardcanvas-backend`.
- If it fails on page loads (`/`), check if the Next.js app is running: `pm2 status`.

### Q: Rust backend service fails to start or reports file errors.
**A**: Ensure the systemd log folder `/var/log/cardcanvas-backend` exists and is owned by `azureuser`. Check system logs:
```bash
journalctl -u cardcanvas-backend -n 50 --no-pager
```
Ensure your database connection string in `.env` is correct and includes `?sslmode=require` if deploying to managed cloud instances.
