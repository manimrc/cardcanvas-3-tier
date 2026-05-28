# 🐳 Production Engineering, Docker & Azure DevOps Operations Guide

This guide is a hands-on learning document for **Sleekly**. It is designed to bridge the gap between application development and system operations (SRE / DevOps) with a specific focus on enterprise-grade container pipelines and Azure-native automated workflows.

Instead of dumping raw scripts, this document follows a **progressive learning flow**. We start by containerizing the application and monitoring it in a local developer environment, and then evolve that identical architecture into a production-hardened, automated enterprise deployment in Microsoft Azure using Terraform and Azure DevOps (Azure Pipelines).

---

## 🏛️ Monolith-to-Cloud Architectural Progression

```
[ PHASE 1: LOCAL DEVELOPER PLAYGROUND ]
  Developer Browser ──> Next.js (Port 3000) ──> Axum Backend (Port 8080) ──> PostgreSQL (Port 5432)
                                                └─> Scraped by: Prometheus & Promtail/Loki

[ PHASE 2: AZURE PRODUCTION CLOUD ]
  Public Internet ──> HTTPS (443) ──> Azure Application Gateway + WAF
                                                │ (HTTP: Private Subnet)
                                                ▼
                                    [snet-frontend (10.0.1.0/24)]
                                    VM-Frontend (Nginx Proxy + Next.js Container)
                                                │
                                                ▼ (HTTP: Private Subnet)
                                    [snet-backend (10.0.2.0/24)]
                                    VM-Backend (Nginx Proxy + Axum Container)
                                                │
                                                ▼ (Private Link / 5432)
                                    [snet-db (10.0.3.0/24 Delegated)]
                                    Azure PostgreSQL Flexible Server
```

---

## 🛠️ Section 1: Local Development Environment

We start by containerizing the Next.js frontend and the Rust Axum backend. The goal is to build local development environments that enforce **Development/Production Parity** (12-Factor App methodology), ensuring that the code runs inside the same container environment on your local machine as it does in production.

---

### 1.1. Containerizing the Monolith: Writing Dockerfiles

A production-grade Dockerfile must be:
1. **Minimal**: Smaller images reduce network transfer times and minimize security vulnerabilities.
2. **Deterministic**: Builds must yield identical layers every run.
3. **Cached**: Leverage Docker's layer-caching mechanism to keep compilation fast.

#### 1.1.1. Next.js Frontend Dockerfile (`sleekly-frontend/Dockerfile`)
The frontend uses a **multi-stage build** to avoid copying developer dependencies (`devDependencies`) and raw source files into the runtime image. We configure Next.js to use `standalone` output, which aggregates only the files required to run the Node.js server.

```dockerfile
# --- Stage 1: Dependency Collector ---
FROM node:20-alpine AS deps
WORKDIR /app
# Copy package manifests first to cache dependency layers
COPY package*.json ./
RUN npm ci

# --- Stage 2: Application Builder ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Compile the application into a standalone package
RUN npm run build

# --- Stage 3: Minimal Production Runtime ---
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security best practice: Run the container under a non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy static assets and compiled server files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

##### 🧑‍🏫 Why do we use a non-root user (`nextjs`)?
> If a container is compromised (e.g., via a remote code execution vulnerability in Node), and the process runs as `root`, the attacker gains root privileges inside the container namespaces. If they find a kernel container-escape vulnerability, they immediately gain root control over the host VM. Running as a non-privileged user prevents host escalation.

---

#### 1.1.2. Rust Axum Backend Dockerfile (`sleekly-backend/Dockerfile`)
Rust builds are slow because compile-time optimizations require rebuilding crates. We use **cargo-chef** to cache intermediate Rust library compilations.

```dockerfile
# --- Stage 1: Recipe Planner ---
FROM rust:1.75-slim AS planner
WORKDIR /app
RUN cargo install cargo-chef --version 0.1.62
COPY . .
# Prepare a recipe.json detailing our package dependency graph
RUN cargo chef prepare --recipe-path recipe.json

# --- Stage 2: Dependency Compiler (Cache layer) ---
FROM rust:1.75-slim AS cacher
WORKDIR /app
RUN cargo install cargo-chef --version 0.1.62
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY --from=planner /app/recipe.json recipe.json
# Compile all dependencies in release mode. This layer remains cached unless Cargo.lock changes.
RUN cargo chef cook --release --recipe-path recipe.json

# --- Stage 3: Application Builder ---
FROM rust:1.75-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY . .
# Copy pre-compiled dependencies and build target directories
COPY --from=cacher /app/target target
COPY --from=cacher /usr/local/cargo /usr/local/cargo
RUN cargo build --release --bin sleekly-backend

# --- Stage 4: Bare Runtime Image ---
FROM debian:bookworm-slim AS runtime
WORKDIR /app
# Install OpenSSL 3 and CA certificates for secure HTTPS external queries
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
# Copy binary and migrations folder
COPY --from=builder /app/target/release/sleekly-backend /app/
COPY --from=builder /app/migrations /app/migrations
RUN mkdir -p /app/uploads
ENV PORT=8080
EXPOSE 8080
CMD ["./sleekly-backend"]
```

##### 🧑‍🏫 Why use `cargo-chef`?
> Standard Docker builds copy Cargo.toml/Cargo.lock, run a dummy build, copy src, and rebuild. `cargo-chef` does this properly by outputting a JSON recipe of the exact versions, compiling the dependencies in an isolated layer, and mapping them directly to the final compile step, speeding up subsequent developer builds by up to 90%.

---

### 1.2. Local Orchestration: Docker Compose

Now that we have Dockerfiles, we compile and orchestrate them locally alongside the database and monitoring services using a single configuration file.

Create `docker-compose.dev.yml` in the project root:

```yaml
version: '3.8'

networks:
  sleekly-dev-net:
    driver: bridge

volumes:
  pg-data:
  loki-data:
  prometheus-data:
  grafana-data:

services:
  # Database Layer
  postgres-dev:
    image: postgres:15-alpine
    container_name: sleekly-postgres-dev
    environment:
      POSTGRES_USER: sleekly_dev_user
      POSTGRES_PASSWORD: sleekly_dev_password
      POSTGRES_DB: sleekly_dev
    ports:
      - "5432:5432"
    volumes:
      - pg-data:/var/lib/postgresql/data
    networks:
      - sleekly-dev-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sleekly_dev_user -d sleekly_dev"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Backend REST API Layer
  backend-dev:
    build:
      context: ./sleekly-backend
      dockerfile: Dockerfile
    container_name: sleekly-backend-dev
    environment:
      DATABASE_URL: postgres://sleekly_dev_user:sleekly_dev_password@postgres-dev:5432/sleekly_dev
      JWT_SECRET: local-dev-only-secret-key-123456789
      PORT: 8080
      MEDIA_DIR: /app/uploads
      RUST_LOG: sleekly_backend=debug,tower_http=info
      FRONTEND_URL: http://localhost:3000
    ports:
      - "8080:8080"
    volumes:
      - ./sleekly-backend/uploads:/app/uploads
    networks:
      - sleekly-dev-net
    depends_on:
      postgres-dev:
        condition: service_healthy

  # Frontend Next.js Web Layer
  frontend-dev:
    build:
      context: ./sleekly-frontend
      dockerfile: Dockerfile
    container_name: sleekly-frontend-dev
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080
      PORT: 3000
    ports:
      - "3000:3000"
    networks:
      - sleekly-dev-net
    depends_on:
      - backend-dev

  # Observability - Loki (Centralized Logs Store)
  loki:
    image: grafana/loki:2.8.2
    container_name: cc-loki-dev
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml
    volumes:
      - loki-data:/loki
    networks:
      - sleekly-dev-net

  # Observability - Promtail (Log Collector Agent)
  promtail:
    image: grafana/promtail:2.8.2
    container_name: cc-promtail-dev
    volumes:
      # Promtail needs access to the host's docker socket & logs to scrape container output
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./deployment/observability/promtail-config.yml:/etc/promtail/config.yml
    command: -config.file=/etc/promtail/config.yml
    networks:
      - sleekly-dev-net
    depends_on:
      - loki

  # Observability - Prometheus (Time-Series Metric Scraping)
  prometheus:
    image: prom/prometheus:v2.45.0
    container_name: cc-prometheus-dev
    ports:
      - "9090:9090"
    volumes:
      - ./deployment/observability/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus
    networks:
      - sleekly-dev-net
    depends_on:
      - backend-dev

  # Observability - Grafana Dashboard UI
  grafana:
    image: grafana/grafana:10.0.0
    container_name: cc-grafana-dev
    ports:
      - "3001:3000" # Map to port 3001 to avoid port collisions with Next.js
    volumes:
      - grafana-data:/var/lib/grafana
    networks:
      - sleekly-dev-net
    depends_on:
      - loki
      - prometheus
```

---

### 1.3. Deep-Dive: Networking, Volumes, & Service Discovery

#### 1.3.1. Container Networking (Docker Bridge Network)
When Docker compose boots this stack, it creates an isolated virtual bridge network called `sleekly-dev-net`.
- Docker allocates a private subnet (e.g. `172.20.0.0/16`) for this network.
- Each service gets assigned a dynamic IP inside this subnet (e.g., `172.20.0.2` for `postgres-dev`, `172.20.0.3` for `backend-dev`).
- **DNS Resolution**: Docker runs an embedded DNS server at IP `127.0.11`. When `backend-dev` looks up connection string `postgres-dev`, the DNS server resolves `postgres-dev` to its current container IP.

#### 1.3.2. Volumes
We use two types of volumes:
1. **Named Volumes** (`pg-data`): Created and managed by Docker in a system-specific directory (e.g., `/var/lib/docker/volumes/`). Named volumes are used for persistent application state like databases. Even if the container is deleted (`docker compose down`), the data persists.
2. **Bind Mounts** (`./sleekly-backend/uploads`): Maps a literal directory from the host filesystem directly inside the container namespace. Useful for developer inspection (e.g., viewing uploaded files locally).

---

### 1.4. Implementing Local Observability

#### 1.4.1. The Prometheus Target Config (`prometheus.yml`)
Create file `deployment/observability/prometheus.yml`:
```yaml
global:
  scrape_interval: 10s # Scrape targets every 10 seconds

scrape_configs:
  - job_name: 'sleekly-backend'
    metrics_path: '/api/metrics'
    static_configs:
      - targets: ['backend-dev:8080']
```

#### 1.4.2. Promtail Log Scraping Config (`promtail-config.yml`)
Promtail scrapes log files from the host docker daemon containers and pushes them to Loki.

Create file `deployment/observability/promtail-config.yml`:
```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: docker-containers
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: 'container'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'stream'
```

#### 1.4.3. The Power of Structured JSON Logging
In [main.rs](file:///Users/mann/Documents/sleekly-backend/src/main.rs), we configured our Rust logger (`tracing-subscriber`) to output logs in pure JSON.
When Axum prints an error:
```json
{"timestamp":"2026-05-23T13:10:00Z","level":"ERROR","fields":{"message":"Database health check failed","error":"Connection refused"}}
```
Loki stores this structured JSON log. In Grafana, you can search for logs using simple LogQL filters:
```logql
{container="sleekly-backend-dev"} | json | level = "ERROR"
```
This is much more efficient than using regular expressions to parse plain text logs.

---

### 1.5. Health Checks & Local Debugging Workflows

#### 1.5.1. Database-Aware Healthchecks
Our Axum `/api/health` check queries the database to ensure the connection pool is healthy. If the database is unresponsive, the route handler returns a `503 Service Unavailable` status code. 

Docker and load balancers monitor this healthcheck. If a container is unhealthy, the network layer stops routing traffic to it.

#### 1.5.2. Debugging Container Failures
If a service fails to start, use these commands to debug:
```bash
# 1. View container status
docker compose -f docker-compose.dev.yml ps

# 2. View recent logs
docker compose -f docker-compose.dev.yml logs --tail=100 backend-dev

# 3. Inspect container metadata (IPs, mounts, healthcheck results)
docker inspect sleekly-backend-dev

# 4. Open a shell inside the running container to debug connectivity
docker exec -it sleekly-backend-dev /bin/sh

# Test if backend can reach database from inside the container
nc -zvw3 postgres-dev 5432
```

---

## ☁️ Section 2: Azure Cloud Production Environment

We will now evolve our local development architecture into an enterprise-grade production environment in Microsoft Azure. This setup relies on Managed Services for the database tier and private VMs orchestrated via Azure DevOps Pipelines.

---

### 2.1. Enterprise Release & Deployment Topology

```mermaid
flowchart TD
    subgraph Repo ["Azure DevOps Repository (Git)"]
        SourceCode["Application Code"]
        IaCCode["Terraform Code"]
    end

    subgraph Pipelines ["Azure DevOps Pipelines"]
        direction TB
        subgraph InfraPipe ["A. Infrastructure Pipeline"]
            TFInit["1. TF Init"] --> TFValidate["2. TF Validate & Format"]
            TFValidate --> TFPlan["3. TF Plan (Saves plan artifact)"]
            TFPlan --> TFApprove["4. Manual Gate (SRE Review)"]
            TFApprove --> TFApply["5. TF Apply (Azure Provisioning)"]
        end

        subgraph AppPipe ["B. Application Pipeline (Multi-Stage)"]
            AppBuild["1. Build & Test (Rust/Node)"] --> AppScan["2. Trivy Container Scan"]
            AppScan --> AppPush["3. ACR Push (Git SHA Tag)"]
            AppPush --> DeployStaging["4. Deploy to Staging VM"]
            DeployStaging --> StagingGate["5. Approval Gate (QA Sign-off)"]
            StagingGate --> DeployProd["6. Deploy to Production VM (Blue/Green)"]
        end
    end

    subgraph AzureCloud ["Microsoft Azure Subscription"]
        direction LR
        KeyVault["Azure Key Vault"]
        ACR["Azure Container Registry (ACR)"]
        
        subgraph ProdVNet ["Production Virtual Network (10.0.0.0/16)"]
            VMStaging["vm-staging"]
            VMProdFrontend["vm-prod-frontend (Nginx Proxy)"]
            VMProdBackend["vm-prod-backend (Axum App)"]
            ManagedDB["Azure PostgreSQL Flexible Server (Private Link)"]
        end
    end

    IaCCode --> InfraPipe
    SourceCode --> AppPipe

    TFApply -->|Provisions / Updates| AzureCloud
    AppPush -->|Publishes Container Images| ACR
    DeployStaging -->|az vm run-command| VMStaging
    DeployProd -->|az vm run-command| VMProdBackend
    VMProdBackend -->|Fetch Secrets via MSI| KeyVault
    VMProdBackend -->|Pull Container| ACR
    VMProdBackend -->|SQL Queries (5432)| ManagedDB
```

---

### 2.2. Pipeline Separation of Concerns

A core SRE rule is the strict boundary separation between **Infrastructure Code (IaC)** and **Application Code (App)**.

| Component | Infrastructure Pipeline | Application Pipeline |
| :--- | :--- | :--- |
| **Responsibilities** | Provisions VNets, Subnets, VM Instances, Storage accounts, ACR, Databases, Firewalls, and Key Vault. | Builds binaries, runs unit tests, scans packages, tags images, pushes to registry, updates VM applications. |
| **Trigger** | Changes to `*.tf` files in `infrastructure/`. | Merges to `main`, tag creation, or branch PRs. |
| **State** | Stateful. Relies on Terraform state locks in Azure Blob Storage. | Stateless. Only tracks artifact compilation output (Git SHA). |
| **Security Scope** | High privileges (Contributor/Owner) to create subscriptions, security policies, and resource networks. | Lower privileges (AcrPush to ACR, VM Contributor to run commands on specific VMs). |

---

### 2.3. Part A: The Infrastructure Pipeline (Terraform on Azure DevOps)

To prevent multiple operators from modifying resources concurrently, Terraform state is stored remotely.

#### 2.3.1. Remote State Management (`backend.tf`)
Terraform uses Azure Blob Storage to maintain state files. When a pipeline runs, it locks the state file (`.tflock`) to prevent database corruption from simultaneous updates.

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "rg-terraform-state"
    storage_account_name = "stccprodstate"
    container_name       = "tfstate"
    key                  = "sleekly.production.tfstate"
    use_oidc             = true # Workload Identity Federation (no client secrets)
  }
}
```

#### 2.3.2. Azure Pipelines Infrastructure YAML (`azure-pipelines-infra.yml`)
This YAML defines the multi-stage infrastructure build pipeline. It plans changes, exposes the plan as a build artifact, pauses for manual SRE review, and applies the resource changes.

Create `azure-pipelines-infra.yml`:

```yaml
trigger:
  branches:
    include:
      - main
  paths:
    include:
      - infrastructure/*

pool:
  vmImage: 'ubuntu-latest'

variables:
  - name: AzureServiceConnection
    value: 'sc-azure-production' # Devops Service Connection mapped to subscription
  - name: WorkingDirectory
    value: '$(System.DefaultWorkingDirectory)/infrastructure'

stages:
- stage: Plan
  displayName: 'Terraform Plan Stage'
  jobs:
  - job: Plan
    displayName: 'Validate and Plan Infrastructure'
    steps:
    - task: TerraformInstaller@1
      inputs:
        terraformVersion: 'latest'

    - task: TerraformTaskV4@4
      displayName: 'Terraform Init'
      inputs:
        provider: 'azurerm'
        command: 'init'
        workingDirectory: '$(WorkingDirectory)'
        backendServiceArm: '$(AzureServiceConnection)'
        backendAzureRmResourceGroupName: 'rg-terraform-state'
        backendAzureRmStorageAccountName: 'stccprodstate'
        backendAzureRmContainerName: 'tfstate'
        backendAzureRmKey: 'sleekly.production.tfstate'

    - task: TerraformTaskV4@4
      displayName: 'Terraform Validate'
      inputs:
        provider: 'azurerm'
        command: 'validate'
        workingDirectory: '$(WorkingDirectory)'

    - task: TerraformTaskV4@4
      displayName: 'Terraform Plan'
      inputs:
        provider: 'azurerm'
        command: 'plan'
        workingDirectory: '$(WorkingDirectory)'
        environmentServiceNameAzureRM: '$(AzureServiceConnection)'
        commandOptions: '-out=$(Build.ArtifactStagingDirectory)/tfplan -detailed-exitcode'
      # Collects exit codes: 0 = No changes, 1 = Error, 2 = Changes planned

    # Publish the binary plan file as a pipeline artifact
    - task: PublishBuildArtifacts@1
      displayName: 'Publish Plan Artifact'
      inputs:
        PathtoPublish: '$(Build.ArtifactStagingDirectory)/tfplan'
        ArtifactName: 'tfplan'
        publishLocation: 'Container'

- stage: Apply
  displayName: 'Terraform Apply Stage'
  dependsOn: Plan
  condition: and(succeeded(), eq(stageDependencies.Plan.Plan.outputs['TerraformTaskV4_Terraform_Plan.ExitCode'], '2'))
  jobs:
  # Environment deployment binds this job to Azure DevOps environment approval checks
  - deployment: ApplyInfrastructure
    displayName: 'Apply Infrastructure changes'
    environment: 'azure-production-infra' # Map approval rules to this environment in Azure DevOps UI
    strategy:
      runOnce:
        deploy:
          steps:
          - task: DownloadBuildArtifacts@1
            displayName: 'Download Plan File'
            inputs:
              buildType: 'current'
              downloadType: 'single'
              artifactName: 'tfplan'
              downloadPath: '$(System.DefaultWorkingDirectory)'

          - task: TerraformInstaller@1
            inputs:
              terraformVersion: 'latest'

          - task: TerraformTaskV4@4
            displayName: 'Terraform Init'
            inputs:
              provider: 'azurerm'
              command: 'init'
              workingDirectory: '$(WorkingDirectory)'
              backendServiceArm: '$(AzureServiceConnection)'
              backendAzureRmResourceGroupName: 'rg-terraform-state'
              backendAzureRmStorageAccountName: 'stccprodstate'
              backendAzureRmContainerName: 'tfstate'
              backendAzureRmKey: 'sleekly.production.tfstate'

          - task: TerraformTaskV4@4
            displayName: 'Terraform Apply'
            inputs:
              provider: 'azurerm'
              command: 'apply'
              workingDirectory: '$(WorkingDirectory)'
              environmentServiceNameAzureRM: '$(AzureServiceConnection)'
              commandOptions: '$(System.DefaultWorkingDirectory)/tfplan/tfplan'
```

---

### 2.4. Part B: The Application Pipeline (Multi-Stage Build, Scan & Release)

The application pipeline compiles the code, scans the output container, pushes the hardened container to ACR, and deploys it across staging and production.

#### 2.4.1. Secure Cloud Authentication with OIDC Workload Identity Federation
> [!IMPORTANT]
> **No Long-Lived Client Secrets**: Historically, pipelines used Service Principals with client secrets (passwords) stored as pipeline variables. These secrets expire and risk getting leaked in logs or source code.
>
> **Workload Identity Federation (OIDC)**: Azure DevOps requests an ephemeral OIDC JSON Web Token (JWT) from Azure AD (Entra ID) using a trust relationship. Azure AD validates that the token was generated by the specific Azure DevOps Organization, Project, and Pipeline. If valid, Azure exchanges it for a short-lived Access Token (valid for 1 hour) to run pipeline commands.

---

#### 2.4.2. Azure Pipelines Application YAML (`azure-pipelines-app.yml`)
Create `azure-pipelines-app.yml`:

```yaml
trigger:
  branches:
    include:
      - main
  paths:
    exclude:
      - infrastructure/*
      - README.md

variables:
  - name: AzureConnection
    value: 'sc-azure-production'
  - name: ACR_NAME
    value: 'acrsleeklyprod'
  - name: ACR_LOGIN_SERVER
    value: 'acrsleeklyprod.azurecr.io'
  - name: VM_RESOURCE_GROUP
    value: 'rg-sleekly-prod'
  - name: VM_BACKEND_STAGING
    value: 'vm-cc-staging'
  - name: VM_BACKEND_PROD
    value: 'vm-sleekly-backend'
  - name: IMAGE_TAG
    value: '$(Build.SourceVersion)' # Versioning tagged strictly via Git Commit SHA

stages:
- stage: BuildAndTest
  displayName: 'Build, Test and Containerize'
  jobs:
  - job: TestBackend
    displayName: 'Rust Unit Tests'
    steps:
    - task: rustup@0
      inputs:
        rustup_version: 'stable'
    - script: |
        cd sleekly-backend
        cargo test --release
      displayName: 'Run Cargo Test'

  - job: TestFrontend
    displayName: 'Frontend Compile Checks'
    steps:
    - task: NodeTool@0
      inputs:
        versionSource: 'spec'
        versionSpec: '20.x'
    - script: |
        cd sleekly-frontend
        npm ci
        npm run lint
        npm run build
      displayName: 'Next.js Lint and Build'

  - job: BuildAndPushDocker
    displayName: 'Docker Build & Security Scan'
    dependsOn: [TestBackend, TestFrontend]
    steps:
    - task: Docker@2
      displayName: 'Build Backend Docker Image'
      inputs:
        repository: '$(ACR_NAME)/backend'
        command: 'build'
        Dockerfile: 'sleekly-backend/Dockerfile'
        tags: |
          $(IMAGE_TAG)
          latest

    # Security Best Practice: Run Trivy Static Application Security Testing (SAST)
    - script: |
        docker run --rm \
          -v /var/run/docker.sock:/var/run/docker.sock \
          -v $(Build.ArtifactStagingDirectory):/root/.cache/ \
          aquasec/trivy:latest image \
          --exit-code 1 \
          --severity HIGH,CRITICAL \
          $(ACR_LOGIN_SERVER)/backend:$(IMAGE_TAG)
      displayName: 'Trivy CVE Security Scan'
      # exit-code 1 fails the pipeline if high or critical CVE vulnerabilities are found

    # Push to Registry after verifying the build has zero security blockers
    - task: AzureCLI@2
      displayName: 'Push Container to ACR'
      inputs:
        azureSubscription: '$(AzureConnection)'
        scriptType: 'bash'
        scriptLocation: 'inlineScript'
        inlineScript: |
          az acr login --name $(ACR_NAME)
          docker push $(ACR_LOGIN_SERVER)/backend:$(IMAGE_TAG)
          docker push $(ACR_LOGIN_SERVER)/backend:latest

- stage: DeployStaging
  displayName: 'Deploy to Staging VM'
  dependsOn: BuildAndTest
  jobs:
  - deployment: StagingDeployment
    displayName: 'Deploy to Staging'
    environment: 'staging' # Maps to staging environment (approvals/checks)
    strategy:
      runOnce:
        deploy:
          steps:
          - task: AzureCLI@2
            displayName: 'Deploy via VM Run Command'
            inputs:
              azureSubscription: '$(AzureConnection)'
              scriptType: 'bash'
              scriptLocation: 'inlineScript'
              inlineScript: |
                az vm run-command invoke \
                  --resource-group $(VM_RESOURCE_GROUP) \
                  --name $(VM_BACKEND_STAGING) \
                  --command-id RunShellScript \
                  --scripts "
                    az acr login --name $(ACR_NAME)
                    docker stop cc-app-staging || true
                    docker rm cc-app-staging || true
                    docker run -d \
                      --name cc-app-staging \
                      --restart always \
                      -p 8080:8080 \
                      -v /var/www/sleekly-staging/uploads:/app/uploads \
                      --env-file /var/www/sleekly-staging/.env \
                      $(ACR_LOGIN_SERVER)/backend:$(IMAGE_TAG)
                  "

- stage: DeployProduction
  displayName: 'Deploy to Production VM (Blue/Green)'
  dependsOn: DeployStaging
  jobs:
  - deployment: ProductionDeployment
    displayName: 'Orchestrate Blue/Green Deployment'
    environment: 'production' # Enforces manual approval gate & window checks in Azure DevOps UI
    strategy:
      runOnce:
        deploy:
          steps:
          - task: AzureCLI@2
            displayName: 'Invoke Blue/Green Deployment Script'
            inputs:
              azureSubscription: '$(AzureConnection)'
              scriptType: 'bash'
              scriptLocation: 'inlineScript'
              inlineScript: |
                # The pipeline fires the VM Agent to execute our deploy-blue-green script
                az vm run-command invoke \
                  --resource-group $(VM_RESOURCE_GROUP) \
                  --name $(VM_BACKEND_PROD) \
                  --command-id RunShellScript \
                  --scripts "/bin/bash /var/www/sleekly-backend/scripts/deploy-blue-green.sh $(IMAGE_TAG)"
```

---

### 2.5. Environment Promotion Lifecycle & Manual Approvals

We use the Environment feature in Azure DevOps to enforce gating. Staging is updated automatically. However, to deploy to Production, the team must approve the change.

```
       [ STAGING VM DEPLOYED ]
                  │
                  ▼
   [ Integration & QA Testing (Automated/Manual) ]
                  │
                  ▼
  [ AZURE DEVOPS ENVIRONMENT GATE ]
  - Pause pipeline execution
  - Notify SRE / Tech Leads
  - Review: Diff size, Jira tickets, Trivy reports
  - Check Active Alerts in Azure Monitor
                  │
         ┌────────┴────────┐
     [ Reject ]        [ Approve ]
         │                 │
         ▼                 ▼
   Stop Pipeline    [ PRODUCTION DEPLOYMENT ]
                    Trigger Zero-Downtime Blue/Green swap
```

---

### 2.6. Secrets Management with Azure Key Vault Integration

To prevent secrets from leaking in git repositories, our database passwords and JWT secrets are stored in an **Azure Key Vault** (`kv-sleekly-prod`).

We configure Key Vault access using **Azure Managed Service Identity (MSI)**:
1. Enable System-Assigned Identity on the VM (`vm-sleekly-backend`).
2. Set a Key Vault access policy allowing the VM's identity to run **Get Secrets** operations.
3. During VM deployment or application startup, the VM requests secrets directly from Key Vault over a secure connection:

```bash
# In the startup wrapper script or the deployment commands on the VM:
# 1. Fetch Key Vault Access Token using local instance Metadata service (IMDS endpoint)
TOKEN=$(curl -s 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fvault.azure.net' -H Metadata:true | jq -r .access_token)

# 2. Extract database password secret directly from Key Vault API
DB_PASSWORD=$(curl -s 'https://kv-sleekly-prod.vault.azure.net/secrets/DB-PASSWORD?api-version=7.4' -H "Authorization: Bearer $TOKEN" | jq -r .value)

# 3. Write variables to .env on the fly (never commits password to disk or environment definitions)
echo "DB_PASSWORD=$DB_PASSWORD" >> /var/www/sleekly-backend/.env
```

---

### 2.7. VM Host Configurations & Nginx Reverse Proxy

Nginx acts as the entry gateway. It terminates SSL, forwards traffic to the Docker container layers, secures headers, limits requests to prevent DDoS attacks, and caches static files.

Create Nginx Configuration: `/etc/nginx/sites-available/sleekly`

```nginx
# Configure Rate Limiting: 100 requests per minute per IP address
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/m;

# Define Upstream Servers for Frontend (Next.js)
upstream frontend_servers {
    server 127.0.0.1:3000;
    keepalive 32;
}

# Define Upstream Servers for Backend (Axum API)
# The deployment script updates this target port (8080/8081) during Blue/Green rotation
upstream backend_servers {
    server 127.0.0.1:8080;
    keepalive 32;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name sleekly.yourdomain.com;
    return 301 https://$host$request_uri;
}

# HTTPS Configuration
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name sleekly.yourdomain.com;

    # SSL Certificates (Issued via Certbot)
    ssl_certificate /etc/letsencrypt/live/sleekly.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/sleekly.yourdomain.com/privkey.pem;

    # Strict SSL Security Settings (A+ Profile)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    
    # Session Optimization
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # Security Headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Proxy buffering optimization for NextJS
    proxy_buffers 16 16k;
    proxy_buffer_size 32k;

    # Route Frontend requests
    location / {
        proxy_pass http://frontend_servers;
        proxy_http_version 1.1;
        
        # Enable Websocket Support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Route Backend API requests (with Rate Limiting)
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://backend_servers;
        proxy_http_version 1.1;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Real-time responses: Disable proxy buffering for server-sent events or streaming
        proxy_buffering off;
    }
}
```

---

### 2.8. Zero-Downtime Releases: Blue/Green Deployment Script

To deploy application updates without dropping active user connections or showing error pages, we implement a **Blue/Green slot rotation** script on the VM host.

```
       [ USER REQUESTS ] ──> [ Nginx Server (Reverse Proxy) ]
                                      │
               ┌──────────────────────┴──────────────────────┐
               │ (Proxy pass routes traffic)                 │ (Deployment slot)
               ▼                                             ▼
     [ SLOT BLUE (Active) ]                        [ SLOT GREEN (Passive) ]
     - Axum API on Port 8080                       - Axum API on Port 8081
                                                   - New container starts up
                                                   - Health check passes!
                                                   - Nginx config updates proxy to 8081
                                                   - Nginx reloads config (zero downtime)
                                                   - Old container (Port 8080) is stopped
```

Create file `scripts/deploy-blue-green.sh`:

```bash
#!/bin/bash
# Zero-Downtime Blue/Green Container Deployment Script
set -eo pipefail

REGISTRY="acrsleeklyprod.azurecr.io"
IMAGE_NAME="$REGISTRY/backend"
IMAGE_TAG="${1:-latest}" # Defaults to latest if tag not provided
NGINX_CONF="/etc/nginx/sites-available/sleekly"

# 1. Determine active running port
ACTIVE_PORT=$(docker ps --format "{{.Ports}}" --filter "name=sleekly-backend-prod" | grep -oE "808[0-9]" | head -n1 || echo "")

if [ "$ACTIVE_PORT" = "8080" ] || [ -empty "$ACTIVE_PORT" ]; then
    NEW_SLOT="green"
    NEW_PORT="8081"
    OLD_SLOT="blue"
    OLD_PORT="8080"
else
    NEW_SLOT="blue"
    NEW_PORT="8080"
    OLD_SLOT="green"
    OLD_PORT="8081"
fi

echo "Deploying update to slot: $NEW_SLOT (Port: $NEW_PORT)..."

# 2. Pull new image version
az acr login --name acrsleeklyprod
docker pull "$IMAGE_NAME:$IMAGE_TAG"

# 3. Start new container
docker run -d \
  --name "sleekly-backend-prod-$NEW_SLOT" \
  --restart always \
  -p "127.0.0.1:$NEW_PORT:8080" \
  -v /var/www/sleekly-backend/uploads:/app/uploads \
  --env-file /var/www/sleekly-backend/.env \
  "$IMAGE_NAME:$IMAGE_TAG"

# 4. Perform Health Check Loop
HEALTH_URL="http://127.0.0.1:$NEW_PORT/api/health"
echo "Verifying health check at $HEALTH_URL..."

HEALTH_STATUS="failed"
for i in {1..15}; do
    STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "000")
    if [ "$STATUS_CODE" = "200" ]; then
        HEALTH_STATUS="healthy"
        break
    fi
    echo "Wait step $i/15: Waiting for service start (Response: $STATUS_CODE)..."
    sleep 4
done

if [ "$HEALTH_STATUS" != "healthy" ]; then
    echo "ERROR: Health check failed! Rolling back deployment..."
    docker stop "sleekly-backend-prod-$NEW_SLOT" || true
    docker rm "sleekly-backend-prod-$NEW_SLOT" || true
    exit 1
fi

echo "Health check passed. Re-routing Nginx proxy configuration..."

# 5. Swap Nginx port configurations
# Replace "server 127.0.0.1:8080" or similar backend target inside Nginx file
sudo sed -i "s/:$OLD_PORT;/:$NEW_PORT;/g" "$NGINX_CONF"

# Test and reload Nginx config (zero-downtime config reload)
sudo nginx -t
sudo systemctl reload nginx

# 6. Clean up old container
if [ -n "$ACTIVE_PORT" ]; then
    echo "Letting active requests drain, then stopping old container slot: $OLD_SLOT..."
    sleep 10
    docker stop "sleekly-backend-prod-$OLD_SLOT" || true
    docker rm "sleekly-backend-prod-$OLD_SLOT" || true
fi

echo "Zero-downtime deployment finished successfully! Active slot: $NEW_SLOT (Port: $NEW_PORT)"
```

---

### 2.9. Active Monitoring & Rollback Strategy

Deploying container updates safely requires monitoring for errors during deployments. If a deployment fails, the pipeline should execute an automated rollback.

```
       [ START DEPLOYMENT ]
                │
                ▼
   [ Launch Slot Green (8081) ]
                │
                ▼
    [ HEALTHCHECK: /api/health ]
         │              │
      [ Ok ]         [ Fail ] ──> [ TRIGGER IMMEDIATE ROLLBACK ]
         │                                - Terminate green container
         │                                - Maintain traffic on blue
         ▼                                - Exit deployment with status 1
   [ Route Nginx to 8081 ]
                │
                ▼
   [ MONITOR ERROR RATES (5 min) ]
   - Scrape HTTP 5xx rates via Prometheus
   - Check Log Analytics for exceptions
         │              │
    [ < 1% ]        [ > 1% ] ───> [ TRIGGER POST-ROUTE ROLLBACK ]
         │                                - Re-route Nginx to blue (8080)
         │                                - Reload Nginx (-s reload)
         │                                - Stop green (8081)
         ▼                                - Send alerts to DevOps team
[ Success: Tear down Blue ]
```

---

### 2.10. Container Registry Maintenance & Image Lifecycles

If you build images on every git commit, your Azure Container Registry will grow continuously, increasing storage costs.

#### 🧑‍🏫 SRE Practice: ACR Container Lifecycle Policies
To optimize storage, we configure an **ACR Task** or a retention policy to delete old images automatically:
* **Untagged Images**: Prune untagged images immediately. When a new image is built, the `:latest` tag is reassigned, leaving the old image version untagged.
* **Retention Window**: Retain only the latest **30 images** or images built within the last **30 days**. This keeps enough history to roll back if needed while preventing unbounded storage growth.
* Run a weekly prune task in ACR:
  ```bash
  az acr config retention update --registry acrsleeklyprod --type UntaggedManifests --status enabled --days 7
  ```

---

### 2.11. Operational Troubleshooting & Cheat Sheet

| Incident | Root Cause Analysis | Action / Command |
| :--- | :--- | :--- |
| **Pipeline fails at deploy** | Managed Identity lacks Key Vault Access permission. | Verify the VM's identity is allowed to **Get** secrets in Key Vault policies. |
| **Nginx returns 502 Bad Gateway** | The Axum app container crashed or is not running on the expected port (8080/8081). | `docker ps -a` to inspect active containers, followed by `docker logs sleekly-backend-prod-blue`. |
| **PostgreSQL connection timeout** | The database NSG rules block the VM's private IP. | Check the subnet NSG rules and verify database firewall has private endpoint access enabled. |
| **Database Migrations fail** | Lock contention from another active transaction. | Run `SELECT * FROM pg_stat_activity;` to check for active queries and terminate blocking transactions. |
| **Trivy scan fails pipeline** | The base Docker image contains vulnerabilities. | Update the base image in your Dockerfile (e.g., upgrade `rust:1.75-slim` to a newer patch release) and rebuild. |
