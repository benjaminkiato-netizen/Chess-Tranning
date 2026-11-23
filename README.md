# Dede's practice hub

Trading journal, chess training and a books/movies/anime library, hosted on GitHub Pages.

- `index.html`: home page
- `trading.html`: trade journal (saved in your browser; use Backup/Restore to move it between devices)
- `chess.html`: daily themed Lichess puzzles, dashboard, games (Stockfish review with a one-line explanation per mistake)
- Chess page **Mistake Drills** tab: analyses your recent games, collects your mistakes and missed wins, groups them by type / phase / opening, and drills them in woodpecker cycles (next cycle unlocks when you beat your accuracy and time)
- `library.html`: books, movies and anime to get through, each marked Not started / Reading or Watching / Done / Dropped, with half-star ratings out of 10, a "My take" review, averages and a Top rated sort (saved in your browser, synced with ☁ Sync)
- `thailand.html`: Bangkok move plan: editable monthly budget (left over = emergency buffer), apartment shortlist, which account does what, paying and transit, DTV visa and tax notes, move timeline (saved in your browser, synced with ☁ Sync)
- `chess-lab/`: sparring against Patricia or Maia, Patricia game review, and Lichess-style studies (chapters, variations, comments, arrows, PGN import/export; saved in your browser, so use ⋯ → Backup to keep a copy)
- `chess-lab/pieces/`: piece sets (one folder per set, one PNG per piece), used by every board through `chess-lab/pieces.css`
- `engine/`: Stockfish 19 lite (stockfish.js by Nathan Rugg, GPL-3.0)
- `patricia-wasm-source/`: Patricia 5.1 (Adam Kulju, GPL-3.0) source and build script for `chess-lab/engines/patricia.wasm`
- `chess-lab/engines/maia/`: Maia 3 model, ONNX Runtime and worker from the Maia platform (CSSLab/maia-platform-frontend, GPL-3.0)
- `board-theme.js`: board colors and piece set (🎨 on the chess page and in Chess Lab), saved and synced
- `sync.js`: optional sync between browsers via two private GitHub gists, encrypted in the browser (AES-GCM) with your sync password. Turn on from ☁ Sync on the home page.
