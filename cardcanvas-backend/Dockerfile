# ─── Build Stage ───────────────────────────────────────────────────────────
FROM rust:slim AS builder

# Install build deps
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache deps first (layer caching optimization)
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Build actual source
COPY . .
RUN touch src/main.rs && cargo build --release

# ─── Runtime Stage ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy binary and migrations
COPY --from=builder /app/target/release/cardcanvas-backend .
COPY --from=builder /app/migrations ./migrations

# Create uploads dir
RUN mkdir -p /app/uploads

EXPOSE 8080

ENV RUST_LOG=cardcanvas_backend=info,tower_http=info

CMD ["./cardcanvas-backend"]
