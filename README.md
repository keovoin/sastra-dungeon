# Sastra Dungeon

71-class dungeon-crawler browser game. Vite + TypeScript monorepo; the game is
ported 1:1 from the single-file prototype (see file headers in `apps/web/src/`
for provenance line ranges).

## Commands (from repo root)

```
npm install
npm run dev      # vite dev server on :5173
npm run build    # type-check + production build to apps/web/dist
npm run preview  # serve the production build locally
```

## Layout

- `apps/web/` — the game (index.html + src/{main,game,intro,music}.ts, styles.css)
- `apps/web/src/game.ts` — core engine (71 classes, combat, waves, bosses, upgrades, save)
- `apps/web/src/intro.ts` — story cinematic that wraps class selection
- `apps/web/src/music.ts` — WebAudio music engine (M to toggle)
- SOW: `../SOW.md`
