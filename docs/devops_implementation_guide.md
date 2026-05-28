# Detailed DevOps & Platform Engineering Implementation Guide

This guide provides step-by-step instructions to implement a production-grade infrastructure, secure CI/CD pipelines, configuration management, and observability for the **Sleekly 3-Tier** application on Microsoft Azure.

---

## 📂 Project Directory Organization

To manage this deployment, structure your repository as follows:

```text
sleekly-3-tier/
├── sleekly-backend/          # Rust Backend Source Code
├── sleekly-frontend/         # Next.js Frontend Source Code
├── docker-compose.yml        # Local Dev Environment
├── .github/
│   └── workflows/
│       ├── backend-ci.yml    # GHA Pipeline for Backend
│       └── frontend-ci.yml   # GHA Pipeline for Frontend
├── terraform/                # Infrastructure as Code
│   ├── main.tf               # Global Resources (RG, ACR, Key Vault)
│   ├── providers.tf          # Azure Providers & Remote State
│   ├── variables.tf          # Configurable Variables
│   └── modules/
│       ├── networking/       # VNet, Subnets, NSGs, Peering, Bastion
│       ├── compute/          # VM Scale Sets, App Gateway
│       └── database/         # PostgreSQL Flexible Server & Private Endpoints
└── ansible/                  # Configuration Management
    ├── inventory.ini         # VM Scale Set IPs
    ├── playbook.yml          # Setup playbook (Nginx, PM2, Systemd, OTel)
    └── roles/                # Modular config files
```

---

## 🛠️ Step 1: Secure Networking & Hub-and-Spoke Topology (Terraform)

You will deploy a secure **Hub-and-Spoke** network topology. The Hub contains the Bastion host and Application Gateway, while the Spoke contains the application compute instances and private database endpoints.

### 1. File: `terraform/providers.tf`
Create a remote backend using an Azure Storage Account container to store and lock your state files:

```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.90.0"
    }
  }
  backend "azurerm" {
    resource_group_name  = "sleekly-tfstate-rg"
    storage_account_name = "sleeklytfstatesa"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
  }
}

provider "azurerm" {
  features {}
}
```

### 2. File: `terraform/modules/networking/main.tf`
Define the virtual networks, subnets, and peering:

```hcl
# Hub Virtual Network
resource "azurerm_virtual_network" "hub" {
  name                = "sleekly-hub-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = var.location
  resource_group_name = var.resource_group_name
}

# Spoke Virtual Network
resource "azurerm_virtual_network" "spoke" {
  name                = "sleekly-spoke-vnet"
  address_space       = ["10.1.0.0/16"]
  location            = var.location
  resource_group_name = var.resource_group_name
}

# Subnets in Spoke
resource "azurerm_subnet" "frontend" {
  name                 = "frontend-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.spoke.name
  address_prefixes     = ["10.1.1.0/24"]
}

resource "azurerm_subnet" "backend" {
  name                 = "backend-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.spoke.name
  address_prefixes     = ["10.1.2.0/24"]
}

resource "azurerm_subnet" "database" {
  name                 = "database-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.spoke.name
  address_prefixes     = ["10.1.3.0/24"]
  
  delegation {
    name = "fs-delegation"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

# VNet Peering: Hub to Spoke
resource "azurerm_virtual_network_peering" "hub_to_spoke" {
  name                      = "hub-to-spoke"
  resource_group_name       = var.resource_group_name
  virtual_network_name      = azurerm_virtual_network.hub.name
  remote_virtual_network_id = azurerm_virtual_network.spoke.id
  allow_virtual_network_access = true
}

resource "azurerm_virtual_network_peering" "spoke_to_hub" {
  name                      = "spoke-to-hub"
  resource_group_name       = var.resource_group_name
  virtual_network_name      = azurerm_virtual_network.spoke.name
  remote_virtual_network_id = azurerm_virtual_network.hub.id
  allow_virtual_network_access = true
}
```

### 3. File: `terraform/modules/networking/bastion.tf`
Add a dedicated subnet and Azure Bastion service inside the Hub:

```hcl
resource "azurerm_subnet" "bastion" {
  name                 = "AzureBastionSubnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.hub.name
  address_prefixes     = ["10.0.1.0/24"]
}

resource "azurerm_public_ip" "bastion" {
  name                = "bastion-ip"
  location            = var.location
  resource_group_name = var.resource_group_name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_bastion_host" "main" {
  name                = "sleekly-bastion"
  location            = var.location
  resource_group_name = var.resource_group_name

  ip_configuration {
    name                 = "configuration"
    subnet_id            = azurerm_subnet.bastion.id
    public_ip_address_id = azurerm_public_ip.bastion.id
  }
}
```

---

## 🔒 Step 2: Secrets Management & Managed Identities

Rather than using passwords in environment files, you will configure VMs to authenticate securely to Key Vault using Azure AD Managed Identities.

### 1. File: `terraform/main.tf`
Provision an Azure Key Vault and define access permissions:

```hcl
# Create Resource Group
resource "azurerm_resource_group" "main" {
  name     = "sleekly-production-rg"
  location = "eastus"
}

# Key Vault
resource "azurerm_key_vault" "vault" {
  name                        = "sleekly-production-vault"
  location                    = azurerm_resource_group.main.location
  resource_group_name         = azurerm_resource_group.main.name
  tenant_id                   = data.azurerm_client_config.current.tenant_id
  sku_name                    = "standard"
  purge_protection_enabled    = false
}

# Create User Assigned Identity for Compute Instances
resource "azurerm_user_assigned_identity" "compute" {
  name                = "sleekly-compute-identity"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
}

# Grant Identity access to Key Vault secrets
resource "azurerm_key_vault_access_policy" "compute" {
  key_vault_id = azurerm_key_vault.vault.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_user_assigned_identity.compute.principal_id

  secret_permissions = [
    "Get",
    "List"
  ]
}
```

---

## 🚀 Step 3: CI/CD via GitHub Actions with OpenID Connect (OIDC)

Do not generate static client secrets to connect GitHub to Azure. Instead, configure passwordless **OIDC Federated Credentials** so GitHub Actions can dynamically request short-lived access tokens from Azure.

### 1. Azure Setup (One-time CLI setup)
Run the following commands in the Azure Cloud Shell to establish trust:

```bash
# 1. Create an Entra ID App Registration
APP_ID=$(az ad app create --display-name "github-actions-sleekly-deploy" --query appId -o tsv)

# 2. Create a Service Principal
az ad sp create-for-rbac --uuid $APP_ID --role Contributor --scopes /subscriptions/<SUB_ID>/resourceGroups/sleekly-production-rg

# 3. Create Federated Credential for Main Branch deployments
cat <<EOF > credential-params.json
{
  "name": "sleekly-gha-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<YOUR_GITHUB_USERNAME>/sleekly-3-tier:ref:refs/heads/main",
  "description": "Federated credential for GHA main branch deployments",
  "audiences": ["api://AzureADTokenExchange"]
}
EOF

az ad app federated-credential create --id <OBJECT_ID_OF_APP_REGISTRATION> --parameters @credential-params.json
```

### 2. File: `.github/workflows/backend-ci.yml`
Create the GitHub Actions workflow to build, scan, and deploy the Rust backend:

```yaml
name: Sleekly Backend CI/CD

on:
  push:
    branches: [ main ]
    paths:
      - 'sleekly-backend/**'
      - '.github/workflows/backend-ci.yml'

permissions:
  id-token: write  # Required for Azure OIDC
  contents: read   # Required for checkout

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      # Log in using passwordless OpenID Connect (OIDC)
      - name: Azure Login
        uses: azure/login@v2
        with:
          client-id: ${{ secrets.AZURE_CLIENT_ID }}
          tenant-id: ${{ secrets.AZURE_TENANT_ID }}
          subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

      - name: Log in to Azure Container Registry (ACR)
        run: |
          az acr login --name sleeklyproductionregistry

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and Push Backend Image
        uses: docker/build-push-action@v5
        with:
          context: ./sleekly-backend
          file: ./sleekly-backend/Dockerfile
          push: true
          tags: sleeklyproductionregistry.azurecr.io/sleekly-backend:${{ github.sha }},sleeklyproductionregistry.azurecr.io/sleekly-backend:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # Image Vulnerability Scanning
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'sleeklyproductionregistry.azurecr.io/sleekly-backend:${{ github.sha }}'
          format: 'table'
          exit-code: '1'
          ignore-unfixed: true
          vuln-type: 'os,library'
          severity: 'CRITICAL,HIGH'

      # Rolling upgrade of Azure Scale Set
      - name: Update Azure VMSS Compute Tier
        uses: azure/CLI@v2
        with:
          azcliversion: latest
          inlineScript: |
            az vmss update --resource-group sleekly-production-rg --name sleekly-backend-vmss --set virtualMachineProfile.storageProfile.imageReference.id=/subscriptions/${{ secrets.AZURE_SUBSCRIPTION_ID }}/resourceGroups/sleekly-production-rg/providers/Microsoft.Compute/images/sleekly-backend-v1
            az vmss update-instances --resource-group sleekly-production-rg --name sleekly-backend-vmss --instance-ids "*"
```

---

## ⚙️ Step 4: Configuration Management (Ansible)

Once VMs scale up, you will run an Ansible playbook to configure Nginx, PM2, systemd, and local observability collectors.

### 1. File: `ansible/playbook.yml`
Define target configuration tasks:

```yaml
---
- name: Configure Sleekly Production Compute Nodes
  hosts: all
  become: yes
  tasks:
    - name: Update apt cache and install base dependencies
      apt:
        name:
          - nginx
          - nodejs
          - npm
          - unzip
        state: present
        update_cache: yes

    - name: Install PM2 Globally
      npm:
        name: pm2
        global: yes
        state: present

    # Fetch secrets directly from Azure Key Vault on the node
    - name: Fetch Environment Variables from Key Vault
      shell: |
        az login --identity --allow-no-subscriptions
        az keyvault secret show --vault-name sleekly-production-vault --name DATABASE-URL --query value -o tsv
      register: db_url_secret
      changed_when: false

    - name: Write .env file securely for Backend
      copy:
        dest: /var/www/sleekly-backend/.env
        content: |
          DATABASE_URL={{ db_url_secret.stdout }}
          PORT=8080
          RUST_LOG=info
        owner: azureuser
        group: azureuser
        mode: '0600'

    - name: Copy Nginx Rebranded Config
      copy:
        src: ../deployment/nginx/sleekly.conf
        dest: /etc/nginx/sites-available/sleekly
        mode: '0644'

    - name: Enable Nginx Config Site
      file:
        src: /etc/nginx/sites-available/sleekly
        dest: /etc/nginx/sites-enabled/sleekly
        state: link

    - name: Restart Nginx Service
      systemd:
        name: nginx
        state: restarted
        enabled: yes
```

---

## 📊 Step 5: Observability Dashboard (Prometheus & Grafana)

To manage operations, you will collect and display logs and traces on a unified Grafana dashboard.

### 1. Backend Instrumentation (OTel)
Add tracing instrumentation inside your Rust codebase. Update [main.rs](file:///Users/mann/Documents/Antigravity/cc_desktop_new/cardcanvas-3-tier/sleekly-backend/src/main.rs):

```rust
use opentelemetry::{global, sdk::trace::Tracer};
use opentelemetry_otlp::WithExportConfig;
use tracing_subscriber::{layer::SubscriberExt, Registry};

fn init_telemetry() -> Tracer {
    // Configures OTLP exporter pointing to OpenTelemetry Collector container/agent
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_exporter(
            opentelemetry_otlp::new_exporter()
                .tonic()
                .with_endpoint("http://otel-collector:4317"),
        )
        .install_batch(opentelemetry::runtime::Tokio)
        .expect("Failed to initialize OpenTelemetry");
        
    global::set_tracer_provider(tracer.provider());
    tracer
}
```

### 2. SRE Operations Dashboard Configuration
Create a Grafana dashboard monitoring the **SRE Golden Signals** of your Axum application:

*   **Latency**: The duration required to process client API requests.
    *   *PromQL Query*: `sum(rate(axum_http_request_duration_seconds_sum[5m])) / sum(rate(axum_http_request_duration_seconds_count[5m]))`
*   **Traffic**: HTTP request volume per second.
    *   *PromQL Query*: `sum(rate(axum_http_requests_total[5m])) by (method, handler, status)`
*   **Errors**: Rate of failed requests (HTTP 5xx status codes).
    *   *PromQL Query*: `sum(rate(axum_http_requests_total{status=~"5.."}[5m]))`
*   **Saturation**: VM CPU and Memory utilization limits.
    *   *PromQL Query*: `node_cpu_seconds_total{mode="idle"}` (Inverse metric showing CPU utilization).

---

## 🐳 Platform Engineering & Landing Zone Sandbox Labs (Docker)

To practice platform engineering concepts locally before deploying to public clouds, we have provided a multi-container local topology (`docker-compose.platform-sandbox.yml`) simulating isolated enterprise network subnets.

### Local Sandbox Architecture
- `sleekly-nginx-ingress`: Simulates an **Application Gateway / Public Load Balancer** with WAF. Exposes host port `8081` to handle root traffic `/` and api `/api/` routing.
- `sleekly-frontend-sandbox` & `sleekly-backend-sandbox`: Simulates compute instances inside **Private Subnets**. These containers do NOT expose any host ports, blocking direct host queries.
- `sleekly-postgres-sandbox`: Simulates a **Private Database Endpoints Subnet**. No host ports exposed, completely isolated.
- Observability Nodes: OpenTelemetry Collector, Prometheus, and Grafana containers monitoring the backend metrics.

---

### Lab 1: Network Ingress Routing (Load Balancer Simulation)
1. Verify that the Nginx ingress acts as the single gateway for public requests.
2. Direct HTTP requests to the frontend and backend are blocked from the host since they bind no host ports.
3. Access the web app at `http://localhost:8081` which Nginx routes internally.

### Lab 2: Subnet Isolation Verification (NSG Simulation)
1. Run a shell command inside the frontend sandbox container to test database access:
   ```bash
   docker exec -it sleekly-frontend-sandbox nc -zv postgres 5432
   ```
   *Result*: Connection fails or command not found due to network isolation. Next.js cannot query the database directly.
2. Run the same command inside the backend sandbox container:
   ```bash
   docker exec -it sleekly-backend-sandbox nc -zv postgres 5432
   ```
   *Result*: Connection succeeds, verifying backend-to-database communication permissions.

### Lab 3: Observability Scrape Verification
1. Access the local Grafana monitoring console at `http://localhost:3005`.
2. Connect Prometheus (`http://prometheus:9090`) as a Data Source in Grafana.
3. Query metrics such as `axum_http_requests_total` to track API request rates in real time.
```
