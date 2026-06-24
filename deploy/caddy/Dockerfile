# Custom Caddy build with the HTTP rate limiting module (mholt/caddy-ratelimit).
# The official caddy image has no rate_limit directive, so we compile it in.
FROM caddy:2-builder AS builder
RUN xcaddy build \
    --with github.com/mholt/caddy-ratelimit \
    --with github.com/caddy-dns/cloudflare

FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
