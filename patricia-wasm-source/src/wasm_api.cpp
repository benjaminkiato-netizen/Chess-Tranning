// Browser entry point: the JS worker writes a UCI command into cmd_buf and
// calls patricia_cmd(); output goes to stdout (captured by the WASI shim).
#include "search.h"
#include "uci.h"
#include <memory>
#include <stdio.h>

static Position g_position;
static ThreadInfo *g_info;
static char cmd_buf[65536];

extern "C" {
__attribute__((export_name("patricia_buf"))) char *patricia_buf() { return cmd_buf; }
__attribute__((export_name("patricia_init"))) void patricia_init() {
  g_info = new ThreadInfo();
  init_LMR();
  init_bbs();
  uci_init(*g_info, g_position);
  fflush(stdout);
}
__attribute__((export_name("patricia_cmd"))) void patricia_cmd() {
  uci_handle(*g_info, g_position, std::string(cmd_buf));
  fflush(stdout);
}
}
