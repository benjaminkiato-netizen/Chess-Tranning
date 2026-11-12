#!/bin/sh
# Rebuilds engines/patricia.wasm from Patricia 5.1 (https://github.com/Adam-Kulju/Patricia, GPL-3.0)
# Changes vs upstream: nnue.h embeds the nets as C arrays (PATRICIA_WASM), uci.h's stdin loop is split into
# uci_init/uci_handle, shim/ provides single-threaded <thread>/<mutex>/<condition_variable>, wasm_api.cpp is the entry point.
# Needs wasi-sdk (https://github.com/WebAssembly/wasi-sdk) and the three .nnue files from upstream engine/nets/.
set -e
SDK=${WASI_SDK:-/opt/wasi-sdk}
python3 - <<'PY'
import pathlib
out=['#pragma once']
for sym,f in [('nnue','fingolfin'),('nnue2','finarfin'),('nnue3','feanor')]:
    b=pathlib.Path(f'nets/{f}.nnue').read_bytes()
    out += [f'alignas(64) const unsigned char g_{sym}Data[{len(b)}] = {{', ','.join(map(str,b)), '};']
pathlib.Path('src/nets_embed.h').write_text('\n'.join(out))
PY
CF="--sysroot=$SDK/share/wasi-sysroot --target=wasm32-wasip1 -O3 -ffast-math -msimd128 -DNDEBUG -DPATRICIA_WASM -D_WASI_EMULATED_MMAN -Ishim"
$SDK/bin/clang $CF -D__EMSCRIPTEN__ -std=c11 -c src/fathom/src/tbprobe.c -o tbprobe.o
$SDK/bin/clang $CF -c stub.c -o stub.o
$SDK/bin/clang++ $CF -std=c++20 -fno-exceptions -c src/wasm_api.cpp -o api.o
$SDK/bin/clang++ $CF -mexec-model=reactor api.o tbprobe.o stub.o -lwasi-emulated-mman \
  -Wl,--strip-all -Wl,-z,stack-size=8388608 -Wl,--initial-memory=67108864 -o patricia.wasm
