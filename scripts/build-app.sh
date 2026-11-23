#!/bin/bash
set -e

# GITHUB_WORKSPACE="$(realpath "$(dirname "$0")/..")"
# RUNNER_TEMP="$GITHUB_WORKSPACE/temp"
# mkdir -p "$RUNNER_TEMP"

TIZEN_STUDIO="$RUNNER_TEMP/tizen-studio"
TIZEN="$TIZEN_STUDIO/tools/ide/bin/tizen"
VERSION="${1:-0.1.0}"

# build dummy core
if [[ ! -f "$GITHUB_WORKSPACE/app/retroarch.js" || ! -f "$GITHUB_WORKSPACE/app/retroarch.wasm" ]]; then
  # set up Samsung Empscripten SDK
  cd "$RUNNER_TEMP"
  if [ ! -f emscripten.zip ]; then
    # SDK 1.39.4.7 from https://developer.samsung.com/smarttv/develop/extension-libraries/webassembly/download.html
    curl -L -o emscripten.zip https://developer.samsung.com/smarttv/file/a5013a65-af11-4b59-844f-2d34f14d19a9
  fi
  unzip -q emscripten.zip
  cd ./emscripten-release-bundle/emsdk
  patch fastcomp/emscripten/src/modules.js < "$GITHUB_WORKSPACE/scripts/emscripten.patch"
  ./emsdk activate latest-fastcomp
  source ./emsdk_env.sh

  # build core
  cd "$RUNNER_TEMP"
  git clone --depth 1 https://github.com/dust-7/RetroArch.git
  emmake make -C RetroArch -f Makefile.tizen -j$(nproc) HAVE_STATIC_DUMMY=1
  cp RetroArch/retroarch.{js,wasm} "$GITHUB_WORKSPACE/app/"
fi

# add a reduced asset bundle
if [ ! -f "$GITHUB_WORKSPACE/app/assets/frontend/bundle.zip" ]; then
  cd "$RUNNER_TEMP"
  curl -L -o nightly.7z https://buildbot.libretro.com/nightly/emscripten/RetroArch.7z
  7z x nightly.7z -onightly
  cat nightly/retroarch/assets/frontend/bundle.zip.* > bundle.zip
  unzip -q bundle.zip
  mkdir -p "$GITHUB_WORKSPACE/app/assets/frontend/"
  zip -rq "$GITHUB_WORKSPACE/app/assets/frontend/bundle.zip" bundle/{assets,autoconfig,filters,info}
fi

# set up Tizen Studio
cd "$RUNNER_TEMP"
if [ ! -f tizen-studio_6.0.bin ]; then
  curl -L -o tizen-studio_6.0.bin https://download.tizen.org/sdk/Installer/tizen-studio_6.0/web-cli_Tizen_Studio_6.0_ubuntu-64.bin
fi
chmod +x tizen-studio_6.0.bin
./tizen-studio_6.0.bin --accept-license "$TIZEN_STUDIO"

# build app, update version, package into wgt
"$TIZEN" build-web -e tizen_web_project.yaml -- "$GITHUB_WORKSPACE/app"
sed -i "s/version=\"0.1.0\"/version=\"$VERSION\"/" "$GITHUB_WORKSPACE/app/.buildResult/config.xml"
"$TIZEN" package -t wgt -- "$GITHUB_WORKSPACE/app/.buildResult"
