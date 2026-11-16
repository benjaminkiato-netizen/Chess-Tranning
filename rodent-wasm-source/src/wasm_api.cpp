// Browser entry point for Rodent IV (Pawel Koziol, GPL-3.0): the JS worker writes one UCI
// command into rodent_buf and calls rodent_cmd(); output goes to stdout (captured by the WASI shim).
#include "rodent.h"
#include <stdio.h>

void UciInit();
void UciCommand(const char *cmd);
static char cmd_buf[65536];

extern "C" {
__attribute__((export_name("rodent_buf"))) char *rodent_buf() { return cmd_buf; }
__attribute__((export_name("rodent_init"))) void rodent_init() {
    Glob.threadOverride = 0;
    srand(GetMS());
    BB.Init();
    cEngine::InitSearch();
    POS::Init();
    Glob.Init();
    Par.elo = 2800;
    Par.SetSpeed(Par.elo);
    Par.InitKingAttackTable();
    Par.use_ponder = false;
    Mask.Init();
    Dist.Init();
    Par.chess960 = false;
    Par.useBook = false;          // the opening books (69 MB) aren't shipped
    Par.verboseBook = false;
    Glob.usePersonalityFiles = false;
    Par.DefaultWeights();
    UciInit();
    fflush(stdout);
}
__attribute__((export_name("rodent_cmd"))) void rodent_cmd() {
    UciCommand(cmd_buf);
    fflush(stdout);
}
}
