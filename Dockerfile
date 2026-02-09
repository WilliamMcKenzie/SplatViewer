FROM golang:1.22-bookworm AS builder

WORKDIR /app
COPY server/go.mod ./server/
WORKDIR /app/server
RUN go mod download

COPY server /app/server
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /app/gausy

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/gausy /app/gausy
COPY client /app/client

EXPOSE 67

CMD ["/app/gausy"]
