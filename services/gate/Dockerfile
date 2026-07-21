FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/gate .

FROM alpine:3.22
RUN apk add --no-cache wget && adduser -D -u 10001 openseat
COPY --from=build /out/gate /usr/local/bin/gate
USER openseat
EXPOSE 4200
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4200/health || exit 1
ENTRYPOINT ["gate"]
