# Sleekly Backend

High-performance Rust API for Sleekly, built with Axum and SQLx.

## Architecture: Domain-Driven Modular Monolith

The backend is organized by business domain rather than technical layer. This approach ensures that related logic stays together and boundaries are clearly defined.

### 📁 Directory Structure

*   `src/domain/`: Contains the business logic of the application, partitioned into domain modules.
    *   `auth/`: User registration, login, and session management.
    *   `cards/`: Core card CRUD operations and infinite canvas logic.
    *   `workspaces/`: Folder and Board organization.
    *   `whiteboards/`: Persistence for drawing and whiteboard elements.
    *   `media/`: File upload and metadata management.
*   `src/infrastructure/`: Shared cross-cutting concerns.
    *   `auth.rs`: JWT token generation, verification, and Axum `AuthUser` extractor.
*   `src/state.rs`: The centralized `AppState` which handles Dependency Injection for all services.
*   `src/db.rs`: Database connection pool management and migrations.

### 🏗️ The 3-Tier Pattern

Each module within `src/domain` follows a 3-tier internal structure:

1.  **Repository (`repository.rs`)**:
    *   The only layer that interacts with the database (`sqlx`).
    *   Handles low-level SQL queries and mapping database rows to models.
2.  **Service (`service.rs`)**:
    *   Contains the core business logic.
    *   Handles validations, authorization rules, and coordinates multiple repository calls.
    *   Does not know about HTTP or SQL.
3.  **Routes (`routes.rs`)**:
    *   The Axum interface layer.
    *   Handles request parsing (JSON, Path, Query, Multipart).
    *   Calls the appropriate Service methods.
    *   Formats the HTTP response.

## Development

### Requirements
- Rust (latest stable)
- PostgreSQL

### Local Setup
1.  Copy `.env.example` to `.env` and update your `DATABASE_URL`.
2.  Run migrations:
    ```bash
    cargo sqlx migrate run
    ```
3.  Start the server:
    ```bash
    cargo run
    ```

### Testing
Because of the 3-tier architecture, you can unit-test the Service layer by providing a mock implementation of the Repository.

```bash
cargo test
```

## API Documentation

The backend listens on port `8080` by default. 
Main entry points:
- `/api/auth`: Authentication and user profile.
- `/api/workspace`: Folder and board tree.
- `/api/cards`: Canvas card management.
- `/api/whiteboard`: Drawing element persistence.
- `/api/media`: File uploads.
