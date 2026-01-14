# Combat to Death

**Combat to Death** is a futuristic 1v1 arena fighting game where the arena remembers your actions. Every 10 seconds, a "Ghost Echo" of your previous actions is spawned, creating a chaotic and strategic battlefield where you must fight your opponent while dodging your own past self.

## Features
- **Time Echo Mechanic**: Actions are recorded and replayed as damaging ghosts.
- **Neon Cyberpunk Visuals**: Glowing trails, glitch effects, and dynamic lighting.
- **Local & AI Modes**: Play against a basic AI that adapts to the chaos.
- **Procedural Audio**: Synthesized SFX using Web Audio API.

## How to Run
This game uses ES6 Modules, so it must be run via a local web server (opening `index.html` directly will not work due to CORS policies).

### Option 1: Python (Recommended)
If you have Python installed:
1. Open a terminal in this folder.
2. Run: `python -m http.server`
3. Open `http://localhost:8000` in your browser.

### Option 2: VS Code Live Server
1. Install the "Live Server" extension in VS Code.
2. Right-click `index.html` and select "Open with Live Server".

### Option 3: Node.js
1. Run `npx serve` in this folder.

## Controls
**Player 1:**
- **Move**: W A S D
- **Attack**: F
- **Dash**: Left Shift

**Player 2 (if human):**
- **Move**: Arrow Keys
- **Attack**: Right Ctrl
- **Dash**: Right Shift

## Deployment
To deploy to the web (e.g., GitHub Pages, Itch.io):
1. Upload the entire `memory-map-fighter` folder.
2. Ensure `index.html` is the entry point.
3. No build step is required; it is raw vanilla JS.

## Architecture
- **Core**: Game loop, Input handling, Sound synthesis.
- **Entities**: Player and Echo classes sharing a base Entity class.
- **Systems**:
  - `TimeSystem`: Handles the recording and spawning of Echoes.
  - `Renderer`: Canvas 2D drawing calls.
  - `Physics`: Simple AABB collision detection.

## Credits
Created by GitHub Copilot.
