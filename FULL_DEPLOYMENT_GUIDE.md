# 🚀 CardCanvas: The Ultra-Granular Learning & Deployment Guide

This is a comprehensive DevOps handbook. It is designed to take you from a raw source code environment to a professional, secured, and automated cloud infrastructure. Each section focuses on **Why** (Engineering Theory) and **How** (Granular Execution).

---

## 📑 Table of Contents
1. [Scenario 1: Manual Local Build & Run](#scenario-1-manual-local-build--run)
2. [Scenario 2: Manual VM Deployment (SCP + Systemd)](#scenario-2-manual-vm-deployment-scp--systemd)
3. [Scenario 3: Docker Local Deployment](#scenario-3-docker-local-deployment)
4. [Scenario 4: Infrastructure as Code (Terraform)](#scenario-4-infrastructure-as-code-terraform)
5. [Scenario 5: Azure Portal Manual Setup (The GUI Way)](#scenario-5-azure-portal-manual-setup-the-gui-way)
6. [Scenario 6: Docker VM Deployment (Hybrid)](#scenario-6-docker-vm-deployment-hybrid)
7. [Scenario 7: Zero-Manual Automated Deployment](#scenario-7-zero-manual-automated-deployment)
8. [🔐 Operational Security & SSL](#-operational-security--ssl)
9. [🆘 Comprehensive Troubleshooting FAQ](#-comprehensive-troubleshooting-faq)

---

## Scenario 1: Manual Local Build & Run
**Objective**: Understanding the "Artifact" lifecycle and the difference between development and production builds.

### ❓ Why?
In development, we use "Hot Reloading" which is fast for coding but heavy. In production, we use "Release Binaries" which are static, optimized, and ultra-fast.

### 🛠 The Granular "How" (Step-by-Step)

#### Backend (Rust/Axum):
1.  **Navigate**: `cd cardcanvas-backend`.
2.  **Debug Mode**: `cargo run`. This compiles with the `dev` profile, includes debug symbols, and allows for faster compilation but slower execution.
3.  **Release Profile**: `cargo build --release`. This triggers the LLVM optimizer to perform aggressive dead-code elimination and loop unrolling.
4.  **Optimization**: Use `strip target/release/cardcanvas-backend` to remove unnecessary symbols and reduce the binary size by ~20-30%.
5.  **Execution**: Test the production binary locally with `./target/release/cardcanvas-backend`.

#### Frontend (Next.js):
1.  **Navigate**: `cd cardcanvas-frontend`.
2.  **Environment Setup**: Create a `.env.production` file and set `NEXT_PUBLIC_API_URL=http://localhost:8080`.
3.  **Dependency Install**: `npm install`. This populates the `node_modules` folder.
4.  **The Build**: `npm run build`. This triggers `next build` which performs tree-shaking (removing unused code) and image optimization.
5.  **Execution**: Run `npm run start` to serve the production-ready build.

---

## Scenario 2: Manual VM Deployment (SCP + Systemd)
**Objective**: Learning Linux process management and the "Immortality" of background daemons.

### ❓ Why?
A standard terminal process dies when the session ends. We use **Systemd** to ensure the app starts on boot and restarts automatically if it crashes.

### 🛠 The Granular "How" (Step-by-Step)
1.  **Binary Transfer**: `scp target/release/cardcanvas-backend azureuser@<IP>:/var/www/cardcanvas-backend/`.
    - *Tip: The `/var/www` path is the Linux standard for web applications.*
2.  **Permission Setup**: On the VM, run `sudo chown azureuser:azureuser /var/www/cardcanvas-backend/cardcanvas-backend`.
3.  **Define the Service**: `sudo nano /etc/systemd/system/cardcanvas-backend.service`.
    - `ExecStart`: The absolute path to your binary.
    - `Restart=always`: Tells Linux to revive the app if it fails.
4.  **Load & Fire**: 
    - `sudo systemctl daemon-reload`: Re-scans the service directory.
    - `sudo systemctl enable cardcanvas-backend`: Configures the app to start on VM boot.
    - `sudo systemctl start cardcanvas-backend`: Starts the app immediately.

---

## Scenario 3: Docker Local Deployment
**Objective**: Learning Image Immutability and Environment Consistency.

### ❓ Why?
Docker eliminates the "It works on my machine" problem by bundling the specific OS version, libraries, and code into a single, unchangeable Image.

### 🛠 The Granular "How" (Step-by-Step)
1.  **Review Dockerfile**: Look at the "Multi-stage build". 
    - Stage 1: Compiles the code in a heavy environment.
    - Stage 2: Copies ONLY the binary into a tiny, secure "Alpine" or "Debian-slim" environment.
2.  **Compose**: `docker compose up --build`.
    - `services`: Defines your app components.
    - `networks`: Creates a virtual bridge for them to talk to each other.
3.  **Verify**: Run `docker stats` to see real-time resource usage of your containers.

---

## Scenario 4: Infrastructure as Code (Terraform)
**Objective**: Learning to treat infrastructure as reproducible source code.

### ❓ Why?
Manually creating 10 servers is exhausting. Terraform is "Declarative"—you describe the final state you want, and Terraform calculates the most efficient way to build it.

### 🛠 The Granular "How" (Step-by-Step)
1.  **Initialization**: `terraform init`. This installs the `azurerm` provider (the driver that talks to Azure).
2.  **The Plan**: `terraform plan -out=deploy.plan`. This dry-runs your code and detects if a change will be an "Update" or a "Destroy & Recreate".
3.  **Execution**: `terraform apply "deploy.plan"`. 
4.  **Why the `.tfstate`?** This file is your "Ground Truth". It tracks the mapping between your code and the actual Azure IDs.

---

## Scenario 5: Azure Portal Manual Setup (The GUI Way)
**Objective**: Understanding the underlying Cloud Architecture components.

### ❓ Why?
To debug a cloud app, you must know how a **VNet** (Network) connects to a **NIC** (Interface) which sits behind an **NSG** (Firewall).

### 🛠 The Granular "How" (Step-by-Step)
1.  **Identity**: Create a **Resource Group** (a logical container for all parts).
2.  **Network**: Create a **Virtual Network**. Define subnets (e.g., `10.0.1.0/24` for Frontend).
3.  **Firewall**: Create a **Network Security Group**. 
    - Add **Inbound Rules**: Port 80 (HTTP), 443 (HTTPS), 22 (SSH).
4.  **Compute**: Create a **Virtual Machine**.
    - OS: Ubuntu 22.04 LTS.
    - Authentication: SSH Public Key (the most secure way).
5.  **Association**: Attach your VM's NIC to the NSG.

---

## Scenario 6: Docker VM Deployment (Hybrid)
**Objective**: Mastering the "Build Once, Run Anywhere" lifecycle.

### ❓ Why?
You build the image once locally (or in CI), push it to a Registry (ACR), and any server in the world can pull and run it perfectly.

### 🛠 The Granular "How" (Step-by-Step)
1.  **Registry Login**: `az acr login --name <registry_name>`.
2.  **Tagging**: `docker tag cc-backend:latest <registry>.azurecr.io/cc-backend:v1.0`.
3.  **Pushing**: `docker push <registry>.azurecr.io/cc-backend:v1.0`.
4.  **Pulling on VM**: SSH into the VM and run `docker pull <registry>.azurecr.io/cc-backend:v1.0`.

---

## Scenario 7: Zero-Manual Automated Deployment
**Objective**: Professional Productivity through Automation.

### ❓ Why?
Deployment should be a "non-event". By automating everything into a script, you remove human error and ensure that every release is identical.

### 🛠 The Granular "How" (Step-by-Step)
1.  **The Script**: Review `scripts/deploy.sh`.
    - It uses **SSH Command Execution**: `ssh user@ip "command"`.
    - It uses **Tarballing**: `tar -czf frontend.tar.gz .` to shrink thousands of small files into one fast-transfer file.
2.  **Execution**: 
    - `export BACKEND_IP="x.x.x.x"`
    - `./scripts/deploy.sh`
3.  **Why it works**: It treats the server as an API—you send it a command and a payload, and it updates itself.

---

## 🔐 Operational Security & SSL
**Objective**: Moving from "It works" to "It's safe".

### 🛠 The Granular "How"
1.  **Reverse Proxy (Nginx)**: 
    - Edit `/etc/nginx/sites-available/cardcanvas`.
    - Use `proxy_pass http://localhost:3000`.
    - **Why?** This hides your application port (3000) from the internet.
2.  **SSL (Certbot)**: 
    - `sudo certbot --nginx -d example.com`.
    - **Why?** It generates a cryptographic certificate that encrypts the data between the user and your server.

---

## 🆘 Comprehensive Troubleshooting FAQ

### Q: My Rust backend says "Database connection refused".
**A**: Check your `DATABASE_URL`. If you are using Azure PostgreSQL, you MUST include `?sslmode=require`. Also, ensure the VM's Private IP is whitelisted in the Azure DB Firewall.

### Q: Nginx is showing "502 Bad Gateway".
**A**: This means Nginx is running, but your app (the backend or frontend) is NOT. Run `sudo systemctl status cardcanvas-backend` or `pm2 list` to check.

### Q: Why do my images disappear after a Docker restart?
**A**: Containers are ephemeral. You must use **Docker Volumes** to map a folder on the VM host to a folder inside the container. Check your `docker-compose.yml` for the `volumes:` key.

### Q: How do I see logs for a failed deployment?
**A**: 
- Systemd: `journalctl -u cardcanvas-backend -n 100 --no-pager`.
- PM2: `pm2 logs cardcanvas-frontend`.
- Nginx: `sudo tail -f /var/log/nginx/error.log`.
