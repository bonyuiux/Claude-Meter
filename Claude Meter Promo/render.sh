#!/bin/zsh
# Exports the promo to claude-meter-promo.mp4 (1080×1350, 30 fps, H.264). Takes about a minute.
set -e
cd "$(dirname "$0")"
mkdir -p .build
EXTRA=()
INC=/Library/Developer/CommandLineTools/usr/include/swift
if [ -f "$INC/module.modulemap" ] && [ -f "$INC/bridging.modulemap" ] && grep -q SwiftBridging "$INC/module.modulemap"; then
  : > .build/empty.modulemap
  cat > .build/overlay.yaml <<YAML
{ "version": 0, "case-sensitive": "false", "roots": [ { "type": "directory", "name": "$INC",
  "contents": [ { "type": "file", "name": "module.modulemap", "external-contents": "$PWD/.build/empty.modulemap" } ] } ] }
YAML
  EXTRA=(-vfsoverlay .build/overlay.yaml)
fi
swiftc -O -swift-version 5 "${EXTRA[@]}" -module-cache-path .build/cache render.swift -o .build/render \
  -framework Cocoa -framework WebKit -framework AVFoundation
.build/render "$PWD"
