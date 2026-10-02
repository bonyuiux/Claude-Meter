#!/bin/zsh
# Builds "Claude Meter.app" next to this file. Run: ./build.sh
set -e
cd "$(dirname "$0")"
APP="Claude Meter.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# Workaround: some Command Line Tools versions ship the SwiftBridging module twice, which breaks
# every build. Only on those Macs, hide the duplicate from the compiler (nothing on the system changes).
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
swiftc -O -swift-version 5 "${EXTRA[@]}" -module-cache-path .build/cache \
  Meter.swift -o "$APP/Contents/MacOS/ClaudeMeter" -framework Cocoa -framework WebKit -framework ServiceManagement
cp -R ui "$APP/Contents/Resources/ui"
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Claude Meter</string>
  <key>CFBundleIdentifier</key><string>local.bon.claude-meter</string>
  <key>CFBundleExecutable</key><string>ClaudeMeter</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
codesign --force --sign - "$APP" 2>/dev/null || true
# The Claude Code hook that feeds the status bubble (settings.json points at this copy).
mkdir -p "$HOME/.claude-meter"
cp hooks/claude-meter-hook.sh "$HOME/.claude-meter/hook.sh"
echo "Built $APP"
