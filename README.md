# Pathogen Dominion

A turn-based strategy game inspired by Civilization II, reimagined as scientifically grounded pathogen conquest inside a single human host.

## Play

Open `index.html` in a modern browser, or visit the [live version](https://watts4.github.io/pathogen-dominion/).

## Features

- **6 distinct pathogen factions** — bacteria, viruses, fungi, and parasites, each with unique mechanics
- **28 anatomical regions** — scientifically accurate body map with real biological properties
- **70+ research adaptations** — mutation tree with meaningful tradeoffs
- **Dynamic immune system AI** — innate, adaptive, and treatment responses that escalate
- **Resource management** — biomass, replication, genetic diversity, stealth, energy
- **SNES-style pixel art** — 16-bit retro aesthetic with optional scanline/CRT effects
- **Save/load** — localStorage + JSON export/import

## Run Locally

```bash
# Any static file server works:
python3 -m http.server 8080
# Then open http://localhost:8080
```

No build step, no dependencies, no Node required at runtime.

## Deploy to GitHub Pages

1. Push to GitHub
2. Go to Settings → Pages
3. Set Source to "Deploy from a branch", branch `main`, folder `/ (root)`
4. Site will be live at `https://<user>.github.io/pathogen-dominion/`

## Controls

| Key | Action |
|-----|--------|
| Click | Select region on map |
| E | End turn |
| R | Toggle research panel |
| Escape | Close overlays |

## Architecture

```
index.html          — Game shell
style.css           — SNES-inspired retro CSS
js/
  main.js           — Entry point, UI controller
  data/
    regions.js      — 28 body regions with properties
    factions.js     — 6 pathogen archetypes
    research.js     — 70+ mutation/adaptation items
  engine/
    game.js         — Core game state & turn processor
    events.js       — Random event system
  ui/
    renderer.js     — Canvas map + DOM UI rendering
```

All game state lives in `GameEngine.state` and can be serialized to JSON for save/load.
