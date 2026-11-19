#!/bin/bash
set -e

# GITHUB_WORKSPACE="$(realpath "$(dirname "$0")/..")"
# RUNNER_TEMP="$GITHUB_WORKSPACE/temp"
# mkdir -p "$RUNNER_TEMP"

NAME=$1
REPO=$2
SUBDIR="${3:-}"
MAKEFILE=$4
EXTRA_FLAGS="${5:-}"

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

# clone repos
cd "$RUNNER_TEMP"
git clone --depth 1 "https://github.com/libretro/${REPO}.git"
git clone --depth 1 https://github.com/dust-7/RetroArch.git

# build core
cd "$REPO/$SUBDIR"
emmake make -f "$MAKEFILE" platform=emscripten -j$(nproc)
cp "./${NAME}_libretro_emscripten.bc" "$RUNNER_TEMP/RetroArch/libretro_emscripten.bc"
cd "$RUNNER_TEMP"/RetroArch
emmake make -f Makefile.tizen "LIBRETRO=${NAME}" ${EXTRA_FLAGS} -j$(nproc)
zip -q "$RUNNER_TEMP/${NAME}_libretro.zip" "${NAME}_libretro."{js,wasm}
