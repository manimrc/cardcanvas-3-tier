# CardCanvas Cloud Deployment Guide (Azure)

This guide covers deploying the CardCanvas 3-tier architecture to Microsoft Azure using **Terraform** for infrastructure provisioning and **Docker Compose** on an Azure Virtual Machine.

## Architecture
- **Frontend**: Next.js Standalone (Docker Container)
- **Backend**: Rust / Axum (Docker Container)
- **Database**: Azure PostgreSQL Flexible Server (Managed Database)
- **Registry**: Azure Container Registry (ACR)
- **Host**: Azure Linux VM (Ubuntu 22.04 LTS)

---

## Step 1: Provision Infrastructure with Terraform

The `infrastructure/` directory contains the Terraform configuration needed to spin up the entire environment (VNet, Subnets, VM, PostgreSQL, and ACR).

1. Install [Terraform](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/install-cli) and the [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli).
2. Log in to Azure:
   ```bash
   az login
   ```
3. Generate an SSH key if you don't have one (used for VM access):
   ```bash
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa
   ```
4. Initialize and apply Terraform:
   ```bash
   cd infrastructure
   terraform init
   terraform apply
   ```
   *Type `yes` when prompted. Note the outputs at the end (Public IP, ACR Login Server, DB FQDN).*

---

## Step 2: Push Docker Images to Azure Container Registry (ACR)

Once the ACR is provisioned, build and push your Docker images.

1. Log in to ACR (get credentials from Azure Portal -> ACR -> Access Keys, or use Azure CLI):
   ```bash
   az acr login --name acrcardcanvasprod
   ```
2. Build the images locally, tagging them for your ACR:
   ```bash
   docker build -t acrcardcanvasprod.azurecr.io/cc-frontend:latest ./cardcanvas-v3
   docker build -t acrcardcanvasprod.azurecr.io/cc-backend:latest ./cardcanvas-backend
   ```
3. Push the images:
   ```bash
   docker push acrcardcanvasprod.azurecr.io/cc-frontend:latest
   docker push acrcardcanvasprod.azurecr.io/cc-backend:latest
   ```

---

## Step 3: Run Database Migrations

The Azure PostgreSQL server sits inside a private subnet and is generally only accessible from the VNet. To run the initial migrations, you can SSH into the VM:

```bash
ssh azureuser@<APPLICATION_PUBLIC_IP>
```

Since the VM is pre-installed with the `postgresql-client` via `cloud-init`, you can run the SQL schema:

```bash
# Connect to the Azure PostgreSQL server (it will prompt for the password)
psql -h psql-cardcanvas-prod.postgres.database.azure.com -U ccadmin -d cardcanvas

# Once connected, run the schema creation commands from cardcanvas-backend/migrations/init.sql
```

---

## Step 4: Deploy the Containers to the VM

1. Still connected via SSH on your VM, authenticate Docker to your ACR:
   ```bash
   docker login acrcardcanvasprod.azurecr.io
   ```
2. Create a `docker-compose.yml` file on the VM:
   ```yaml
   version: '3.8'
   services:
     backend:
       image: acrcardcanvasprod.azurecr.io/cc-backend:latest
       container_name: cc-backend
       restart: always
       ports:
         - "8080:8080"
       environment:
         - PORT=8080
         - FRONTEND_URL=http://<APPLICATION_PUBLIC_IP>
         - DATABASE_URL=postgres://ccadmin:SecurePassword123!@psql-cardcanvas-prod.postgres.database.azure.com:5432/cardcanvas?sslmode=require
         - JWT_SECRET=your_super_secret_jwt_key_here
         - MEDIA_DIR=/app/uploads
       volumes:
         - media_uploads:/app/uploads

     frontend:
       image: acrcardcanvasprod.azurecr.io/cc-frontend:latest
       container_name: cc-frontend
       restart: always
       ports:
         - "80:3000"
       environment:
         - NEXT_PUBLIC_API_URL=http://<APPLICATION_PUBLIC_IP>:8080
       depends_on:
         - backend

   volumes:
     media_uploads:
   ```

3. Start the application:
   ```bash
   docker compose up -d
   ```

---

## Step 5: Verify Deployment

Open your browser and navigate to `http://<APPLICATION_PUBLIC_IP>`. 
You should see the Next.js frontend, and you should be able to register a new user, which will communicate with the Rust backend and save data directly into the Azure PostgreSQL Flexible Server!
