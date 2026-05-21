# CardCanvas

CardCanvas is a modern, 3-tier enterprise visual workspace for organizing cards, notes, links, and media on an infinite canvas.

## Architecture

The project is organized as a **Domain-Driven Modular Monolith**, ensuring long-term scalability and maintainability without the overhead of microservices.

1.  **Frontend**: Next.js 16 (React) application serving a dynamic, glassmorphic UI.
2.  **Backend**: High-performance Rust API using Axum, SQLx, and a 3-tier domain-driven architecture.
3.  **Database**: PostgreSQL (Managed via Azure PostgreSQL Flexible Server in production).
4.  **Storage**: Local multipart uploads managed by the dedicated Media domain.

## Project Structure

```text
.
├── cardcanvas-frontend/    # Frontend (Next.js)
├── cardcanvas-backend/     # Backend (Rust / Axum)
│   ├── src/
│   │   ├── domain/         # Business Domains (Auth, Cards, Workspaces, etc.)
│   │   ├── infrastructure/ # Shared Infrastructure (Auth Middleware, DB)
│   │   └── state.rs        # Centralized Dependency Injection
├── infrastructure/         # Terraform (Docker/ACR Deployment)
└── infrastructure-vm/      # Terraform (Bare-Metal VM Deployment)
```

## Backend Architecture: The Modular Monolith

Our Rust backend has been refactored from a layered architecture into a **Domain-Driven Modular Monolith**. Each business capability is isolated within the `src/domain` directory, following a strict 3-tier pattern:

*   **Repository Layer**: Encapsulates all SQLx queries and data access logic.
*   **Service Layer**: Contains pure business logic and coordinates domain operations.
*   **Routes Layer**: Handles Axum request extraction and JSON response formatting.

This structure allows us to:
- Unit test business logic in isolation by mocking repositories.
- Re-use domain logic across different entry points (CLI, Background Jobs, WebSockets).
- Easily split any domain into a microservice in the future if needed.

## Getting Started Locally

You can run the entire 3-tier architecture locally using Docker Compose:

```bash
# Start the environment (Frontend, Rust Backend, PostgreSQL)
docker compose up --build -d
```

- **Frontend App**: [http://localhost:3000](http://localhost:3000)
- **Rust Backend API**: [http://localhost:8080](http://localhost:8080)

## Deployment

We support multiple deployment strategies to Microsoft Azure, including Manual Bare-Metal, Dockerized, and Fully Automated pipelines.

For detailed instructions on why and how to deploy, see our master guide:

👉 **[The Full Deployment Guide](FULL_DEPLOYMENT_GUIDE.md)** 👈

## License

MIT License
