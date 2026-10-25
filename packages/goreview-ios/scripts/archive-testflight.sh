#!/usr/bin/env bash
set -euo pipefail

fail() { printf 'GoReview iOS release: %s\n' "$1" >&2; exit 1; }

: "${REPOSITORY_SERVICE_URL:?Set REPOSITORY_SERVICE_URL to the public HTTPS Repository endpoint.}"
: "${GOREVIEW_BUNDLE_ID:?Set GOREVIEW_BUNDLE_ID to the registered Apple App ID.}"
: "${APPLE_TEAM_ID:?Set APPLE_TEAM_ID to the 10-character Team ID from your Apple Developer account.}"
: "${GOREVIEW_BUILD_NUMBER:?Set GOREVIEW_BUILD_NUMBER to a build number greater than the last uploaded build.}"
: "${GOREVIEW_MARKETING_VERSION:=1.0}"
[[ "$GOREVIEW_BUNDLE_ID" =~ ^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$ ]] || fail 'GOREVIEW_BUNDLE_ID must use reverse-DNS form.'
[[ ! "$GOREVIEW_BUNDLE_ID" =~ (^|\.)(example|invalid|test|localhost)(\.|$) ]] || fail 'Replace the provisional Bundle ID before archiving.'
[[ "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] || fail 'APPLE_TEAM_ID must be the real 10-character Team ID.'
[[ "$GOREVIEW_BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]] || fail 'GOREVIEW_BUILD_NUMBER must be a positive integer.'
[[ "$GOREVIEW_MARKETING_VERSION" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || fail 'GOREVIEW_MARKETING_VERSION must look like 1.0 or 1.0.1.'

command -v xcodebuild >/dev/null || fail 'Run this script on a Mac with Xcode 26 or later installed.'
xcode_version="$(xcodebuild -version | sed -n 's/^Xcode //p')"
xcode_major="${xcode_version%%.*}"
[[ "$xcode_major" =~ ^[0-9]+$ ]] && (( xcode_major >= 26 )) || fail 'Capacitor 8 requires Xcode 26 or later.'

cd "$(dirname "$0")/.."
npm run release:sync
mkdir -p output
archive="$PWD/output/GoReview.xcarchive"
export_dir="$PWD/output/export"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT
export_options="$temp_dir/ExportOptions.plist"
cat > "$export_options" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>destination</key><string>export</string>
  <key>method</key><string>app-store-connect</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>${APPLE_TEAM_ID}</string>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST

xcodebuild \
  -project ios/App/App.xcodeproj \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$archive" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$GOREVIEW_BUNDLE_ID" \
  CURRENT_PROJECT_VERSION="$GOREVIEW_BUILD_NUMBER" \
  MARKETING_VERSION="$GOREVIEW_MARKETING_VERSION" \
  archive

xcodebuild -exportArchive \
  -archivePath "$archive" \
  -exportPath "$export_dir" \
  -exportOptionsPlist "$export_options" \
  -allowProvisioningUpdates

printf '\nExported IPA: %s\nUpload this build from Xcode Organizer or Apple Transporter while signed into the matching App Store Connect account.\n' "$export_dir"
