#!/bin/zsh
# Re-captures every case-study visual from the real widget UI into ../assets/
set -e
cd "$(dirname "$0")"
P="$HOME/Desktop/Claude Meter Promo/.build"
swiftc -O -vfsoverlay "$P/overlay.yaml" -module-cache-path "$P/cache" capture.swift -o capture -framework Cocoa -framework WebKit -framework AVFoundation
./capture "$HOME/Desktop/Claude Meter/ui" "$PWD/../assets"
