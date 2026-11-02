#!/usr/bin/env bash
# The Android SDK and Flutter installed by bin/android-setup.sh, on PATH for the mobile scripts.
# Sourced (never run). ANDROID_HOME / FLUTTER_HOME may point elsewhere (config/local.env).
ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
FLUTTER_HOME="${FLUTTER_HOME:-$HOME/flutter}"
export ANDROID_HOME ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$FLUTTER_HOME/bin:$HOME/.maestro/bin:$PATH"
ANDROID_AVD="${ANDROID_AVD:-shipyard}"
EMULATOR_LOCK="android-emulator"
