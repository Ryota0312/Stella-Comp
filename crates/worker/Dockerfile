ARG RUST_VERSION=1.96.0

FROM rust:${RUST_VERSION}-bookworm AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends clang cmake libclang-dev llvm-dev libopencv-dev pkg-config protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src

COPY Cargo.toml Cargo.lock ./
COPY crates/stellacomp/Cargo.toml crates/stellacomp/Cargo.toml
COPY crates/worker/Cargo.toml crates/worker/Cargo.toml
COPY crates/worker/build.rs crates/worker/build.rs
COPY proto proto
COPY crates crates

RUN cargo build --release -p worker

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libopencv-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /src/target/release/worker /usr/local/bin/stella-worker

ENV STELLA_COMP_WORKER_ADDR=0.0.0.0:50051

EXPOSE 50051

CMD ["stella-worker"]
