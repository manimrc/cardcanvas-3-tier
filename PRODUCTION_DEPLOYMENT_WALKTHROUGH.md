# 🏛 Production Deployment Walkthrough: Manual Azure Portal Path

This guide provides the exact, granular steps to deploy CardCanvas using the **Azure Portal (GUI)**. We will manually provision 1 Backend VM, 1 Frontend VM, and 1 Managed PostgreSQL DB.

---

## 🔗 The Connectivity Map (How they talk)
Before you start clicking, understand the "Wiring":
1.  **Frontend VM ➔ Backend VM**: The Frontend (running in the user's browser) calls the Backend API at `http://<BACKEND_IP>:8080`.
2.  **Backend VM ➔ Database**: The Backend connects to the Managed DB using the `DATABASE_URL` at `<DB_NAME>.postgres.database.azure.com`.
3.  **Firewall Rule 1**: The Backend VM **Network Security Group (NSG)** must allow **Inbound Port 8080**.
4.  **Firewall Rule 2**: The Azure Database **Networking** settings must allow the **Backend VM's Public IP** in its whitelist.

---

## 🏗 Step 1: Managed Database Setup (Azure Portal)
1.  **Search**: Search for "Azure Database for PostgreSQL flexible servers".
2.  **Create**:
    - **Resource Group**: Create new (e.g., `rg-cardcanvas-prod`).
    - **Server name**: `psql-cardcanvas-prod`.
    - **Compute + storage**: Burstable, `B1ms` (cheapest for starting).
    - **Authentication**: PostgreSQL authentication only.
    - **Admin username**: `ccadmin`.
    - **Password**: *Set a secure password and save it.*
3.  **Networking**:
    - Select **Public access (allowed IP addresses)**.
    - Check "Allow public access from any Azure service within Azure to this server".
    - Click **+ Add current client IP address** so you can connect from your terminal.
4.  **Finish**: Click **Review + create** -> **Create**.

---

## 🖥 Step 2: Backend VM Setup (Azure Portal)
1.  **Search**: Search for "Virtual machines".
2.  **Create**:
    - **Resource Group**: Select `rg-cardcanvas-prod`.
    - **VM name**: `vm-backend`.
    - **Image**: Ubuntu Server 22.04 LTS - Gen2.
    - **Size**: `Standard_B1s` or `B2s`.
    - **Authentication**: SSH Public Key.
    - **Username**: `azureuser`.
    - **Public inbound ports**: Select **SSH (22)**.
3.  **Networking Tab**:
    - Allow port **8080** (Add a "Custom" port rule in the Networking tab or later in the NSG).
4.  **Finish**: Click **Review + create** -> **Create**. *Note the Public IP.*

---

## 🎨 Step 3: Frontend VM Setup (Azure Portal)
1.  **Repeat Step 2** with:
    - **VM name**: `vm-frontend`.
    - **Public inbound ports**: Select **SSH (22)**, **HTTP (80)**, and **HTTPS (443)**.
2.  **Finish**: Click **Review + create** -> **Create**. *Note the Public IP.*

---

## 🗄 Step 4: Database Initialization
1.  **Connect**:
    ```bash
    psql -h <DATABASE_FQDN> -U ccadmin -d postgres
    ```
2.  **Create DB**: `CREATE DATABASE cardcanvas;`.
3.  **Apply Schema**: 
    Exit and run: `psql -h <DATABASE_FQDN> -U ccadmin -d cardcanvas < cardcanvas-backend/migrations/20240101000000_init.sql`.

---

## 🦀 Step 5: Backend Deployment
1.  **Build Release**: 
    - `cd cardcanvas-backend`
    - `cargo build --release`
    - `strip target/release/cardcanvas-backend`
2.  **Transfer**: `scp target/release/cardcanvas-backend azureuser@<BACKEND_IP>:/var/www/cardcanvas-backend/`
3.  **Systemd**:
    - SSH into VM: `ssh azureuser@<BACKEND_IP>`.
    - Create `.env`: `DATABASE_URL=postgres://ccadmin:<PW>@<FQDN>:5432/cardcanvas?sslmode=require`.
    - `sudo cp deployment/systemd/cardcanvas-backend.service /etc/systemd/system/`.
    - `sudo systemctl enable --now cardcanvas-backend`.

---

## ⚛️ Step 6: Frontend Deployment
1.  **Build**:
    - `cd cardcanvas-v3`
    - Update `.env.production` -> `NEXT_PUBLIC_API_URL=http://<BACKEND_IP>:8080`.
    - `npm run build`.
2.  **Transfer**: Bundle `.next/standalone` into a tarball and `scp` to Frontend VM.
3.  **Run**: SSH into Frontend VM and run with PM2: `pm2 start server.js`.

---

## 🌐 Step 7: Nginx & SSL
1.  **Nginx**: Apply `deployment/nginx/cardcanvas.conf` on the Frontend VM.
2.  **SSL**: Run `sudo certbot --nginx`.
