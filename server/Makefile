VERSION := 0.2.0
LDFLAGS := -s -w

test:
	go vet ./... && go test -count=1 ./...

# static Linux binaries, cross-compiled on the Mac (no CGO needed)
linux-amd64:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="$(LDFLAGS)" -o asanu-server-linux-amd64 .
linux-arm64:
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -trimpath -ldflags="$(LDFLAGS)" -o asanu-server-linux-arm64 .

# needs Docker (Docker Desktop, OrbStack or Colima) on the Mac
image-amd64:
	docker buildx build --platform linux/amd64 -t asanu-server:$(VERSION) --load .
	docker save asanu-server:$(VERSION) | gzip > asanu-server-$(VERSION)-amd64.tar.gz

.PHONY: test linux-amd64 linux-arm64 image-amd64
