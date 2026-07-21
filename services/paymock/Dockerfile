FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/paymock .

FROM alpine:3.22
RUN apk add --no-cache wget && adduser -D -u 10001 openseat
COPY --from=build /out/paymock /usr/local/bin/paymock
USER openseat
EXPOSE 4100
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4100/health || exit 1
ENTRYPOINT ["paymock"]
