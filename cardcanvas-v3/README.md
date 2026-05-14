# CardCanvas

CardCanvas is a modern, 3-tier enterprise visual workspace for organizing cards, notes, links, and media on an infinite canvas.

## Architecture

CardCanvas has evolved from a local-first desktop application into a fully cloud-native web application:

1. **Frontend**: Next.js 16 (React) application serving a dynamic, glassmorphic UI.
2. **Backend**: High-performance Rust API using the Axum framework and SQLx.
3. **Database**: PostgreSQL (managed via Azure PostgreSQL Flexible Server in production).
4. **Storage**: Local multipart uploads (ready to be swapped for Azure Blob Storage).

## Getting Started Locally

You can run the entire 3-tier architecture locally using Docker Compose. 
Ensure you have [Docker](https://www.docker.com/) installed.

```bash
# Clone the repository
git clone https://github.com/your-org/cardcanvas.git
cd cardcanvas

# Start the environment (Frontend, Rust Backend, PostgreSQL)
docker compose up --build -d
```

Once the containers are running:
- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Rust Backend API**: [http://localhost:8080](http://localhost:8080) (Proxied automatically via `/api/*` from the frontend)

## Deployment

To deploy the application to a production environment (Microsoft Azure), please see our primary [VM Deployment Guide](DEPLOYMENT_VM.md).

The VM deployment guide covers:
- Provisioning infrastructure using Terraform (VNet, Azure VMs, Azure PostgreSQL Flexible Server).
- Deploying the Node.js frontend using PM2 and Nginx.
- Deploying the Rust backend as a Systemd service.

Alternatively, if you prefer deploying using Docker and Azure Container Registry, you can follow the [Docker Deployment Guide](DEPLOYMENT.md).

## License

MIT License
