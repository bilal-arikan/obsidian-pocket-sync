# Pinned PocketBase image with the vault_files migration baked in.
ARG PB_VERSION=0.39.4

FROM alpine:3.20 AS build
ARG PB_VERSION
RUN apk add --no-cache unzip ca-certificates wget
RUN wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pb.zip \
    && unzip /tmp/pb.zip -d /pb

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=build /pb/pocketbase /pb/pocketbase
# Migrations are applied automatically on `serve`.
COPY pb_migrations /pb/pb_migrations

EXPOSE 8090
VOLUME ["/pb/pb_data"]

# Bind to all interfaces inside the container; the reverse proxy terminates TLS.
ENTRYPOINT ["/pb/pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090"]
