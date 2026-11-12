# syntax=docker/dockerfile:1
# Build on the dev machine (any arch), target the server arch with --platform.
FROM --platform=$BUILDPLATFORM golang:1.26-alpine AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
# pure-Go SQLite: CGO off gives a static binary for the scratch image
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /out/asanu-server . \
 && mkdir -p /out/data

FROM scratch
LABEL org.opencontainers.image.source="https://github.com/Andirectli/asanu" org.opencontainers.image.description="Asanu server" org.opencontainers.image.licenses="MIT"
COPY --from=build /out/asanu-server /asanu-server
COPY --from=build --chown=65532:65532 /out/data /data
USER 65532:65532
ENV ASANU_DATA_DIR=/data ASANU_ADDR=:8080
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["/asanu-server", "health"]
ENTRYPOINT ["/asanu-server"]
CMD ["serve"]
