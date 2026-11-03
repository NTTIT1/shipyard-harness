#!/usr/bin/env bash
# One-time install of what mobile (Flutter + Android) projects need on this machine — ~8–10 GB:
# Flutter SDK, Android command-line tools, platform-tools, emulator, an Android 34 x86_64 system
# image, the AVD "shipyard" the shared emulator boots, and Maestro (the QC agent's driver).
# Never run by Shipyard on its own: a person runs it (the dashboard only says it is missing).
#   bin/android-setup.sh            # install what is missing (idempotent)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/_android.sh"
FLUTTER_VERSION="${FLUTTER_VERSION:-3.27.1}"
CMDLINE_TOOLS_ZIP="${CMDLINE_TOOLS_ZIP:-commandlinetools-linux-11076708_latest.zip}"
SYSTEM_IMAGE="system-images;android-34;google_apis;x86_64"
say() { echo "android-setup: $*"; }

[ -r /dev/kvm ] || say "CẢNH BÁO: không đọc được /dev/kvm — máy ảo sẽ rất chậm (thêm user vào nhóm kvm: sudo usermod -aG kvm \$USER)"
for t in curl unzip git java; do command -v "$t" >/dev/null 2>&1 || { say "thiếu $t — cài trước rồi chạy lại"; exit 1; }; done

if [ ! -x "$FLUTTER_HOME/bin/flutter" ]; then
  say "cài Flutter $FLUTTER_VERSION vào $FLUTTER_HOME"
  tmp="$(mktemp -d)"
  curl -fL "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" -o "$tmp/flutter.tar.xz"
  mkdir -p "$(dirname "$FLUTTER_HOME")"; tar -xf "$tmp/flutter.tar.xz" -C "$(dirname "$FLUTTER_HOME")"; rm -rf "$tmp"
fi

if [ ! -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]; then
  say "cài Android command-line tools vào $ANDROID_HOME"
  tmp="$(mktemp -d)"
  curl -fL "https://dl.google.com/android/repository/$CMDLINE_TOOLS_ZIP" -o "$tmp/tools.zip"
  mkdir -p "$ANDROID_HOME/cmdline-tools"; unzip -q "$tmp/tools.zip" -d "$tmp"
  rm -rf "$ANDROID_HOME/cmdline-tools/latest"; mv "$tmp/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"; rm -rf "$tmp"
fi

say "cài platform-tools, emulator, Android 34 và image máy ảo"
yes | sdkmanager --licenses >/dev/null || true
sdkmanager "platform-tools" "emulator" "platforms;android-34" "build-tools;34.0.0" "$SYSTEM_IMAGE"

if ! avdmanager list avd 2>/dev/null | grep -q "Name: $ANDROID_AVD\$"; then
  say "tạo máy ảo $ANDROID_AVD"
  echo no | avdmanager create avd -n "$ANDROID_AVD" -k "$SYSTEM_IMAGE" -d pixel_6
fi

flutter config --android-sdk "$ANDROID_HOME" >/dev/null
yes | flutter doctor --android-licenses >/dev/null 2>&1 || true

if ! command -v maestro >/dev/null 2>&1; then
  say "cài Maestro"
  curl -fsSL "https://get.maestro.mobile.dev" | bash
fi

say "xong. Thêm vào config/local.env (hoặc ~/.bashrc) để dashboard và lane thấy công cụ:"
echo "  export ANDROID_HOME=\"$ANDROID_HOME\" PATH=\"$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$FLUTTER_HOME/bin:\$HOME/.maestro/bin:\$PATH\""
say "rồi khởi động lại dashboard (bin/dashboard.sh restart) để nó nhận ra Flutter."
