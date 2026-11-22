# Chess Lab · Drills (source)

`chess-lab/drills.js` and `chess-lab/drills.css` are built from these files. Drills is kept separate from
the main Chess Lab bundle (`chess-lab/app.js`) on purpose, so either can change without overwriting the other.

Build (from a folder with `chess.js` and `chessground` in node_modules):

    npx esbuild drills.js --bundle --format=esm --minify --outfile=../chess-lab/drills.js
    cp drills.css ../chess-lab/drills.css

Hooks it relies on in `chess-lab/app.js` (Study): `window.__studyLine()` (current line as UCI moves +
board orientation) and `window.__chessSound(san)` (move sounds). Markup lives in `chess-lab/index.html`
(`#drills` panel, `.tab[data-tab="drills"]`, `#st-to-drills` button in Study).
Data: localStorage `chesslab.drills` (synced with the other `chesslab.` keys).
