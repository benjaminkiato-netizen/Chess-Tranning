# Rodent IV for the browser

Rodent IV 0.33 by Pawel Koziol (based on Sungorus 1.4 by Pablo Vazquez), GPL-3.0.
Original source: https://github.com/nescitus/rodent-iv

Changes for the WebAssembly build used by Chess Lab (`chess-lab/engines/rodent.wasm`):

- `uci.cpp`: the stdin loop is split into `UciInit()` and `UciCommand()` so the page can send one UCI command at a time.
- `util.cpp`: no stdin polling (`InputAvailable` returns false) and no `wordexp` under WASI.
- `wasm_api.cpp` (new): exports `rodent_init`, `rodent_buf`, `rodent_cmd`.
- Built single-threaded (`-DNO_THREADS`), without the opening books. Personalities are sent as `setoption` lines from `chess-lab/engines/rodent-personalities.json`, made from the original `personalities/*.txt` files.

Build (wasi-sdk 27):

    clang++ --target=wasm32-wasip1 --sysroot=$WASI_SDK/share/wasi-sysroot -O3 -std=c++14 -w -DNDEBUG -DNO_THREADS \
      -fno-rtti -fno-exceptions -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -mexec-model=reactor \
      -Wl,-z,stack-size=8388608 -Wl,--initial-memory=134217728 -Wl,--max-memory=536870912 \
      -lwasi-emulated-signal -lwasi-emulated-process-clocks src/*.cpp -o rodent.wasm
