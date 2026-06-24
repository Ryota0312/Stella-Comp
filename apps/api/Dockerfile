ARG GO_VERSION=1.26.4

FROM golang:${GO_VERSION}-bookworm AS build

WORKDIR /src/apps/api

COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/stella-api ./cmd/api

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/stella-api /usr/local/bin/stella-api

ENV GIN_MODE=release
ENV STELLA_COMP_API_ADDR=:8080
ENV STELLA_COMP_DATA_DIR=/data
ENV STELLA_COMP_WORKER_ADDR=worker:50051

EXPOSE 8080

CMD ["stella-api"]
