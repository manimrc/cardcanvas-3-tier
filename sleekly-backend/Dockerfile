# Stage 1: Recipe Planner
FROM rust:1.95-slim AS planner
WORKDIR /app
RUN cargo install cargo-chef --version 0.1.62
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

# Stage 2: Cache compiler dependencies
FROM rust:1.95-slim AS cacher
WORKDIR /app
RUN cargo install cargo-chef --version 0.1.62
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json

# Stage 3: Builder
FROM rust:1.95-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
COPY . .
COPY --from=cacher /app/target target
COPY --from=cacher /usr/local/cargo /usr/local/cargo
RUN cargo build --release --bin sleekly-backend

# Stage 4: Minimal Runtime
FROM debian:bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/sleekly-backend /app/
COPY --from=builder /app/migrations /app/migrations
RUN mkdir -p /app/uploads
ENV PORT=8080
EXPOSE 8080
CMD ["./sleekly-backend"]
