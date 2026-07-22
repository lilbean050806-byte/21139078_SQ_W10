# BLOB BRAWL ARENA

## What This Project Demonstrates

Blob Brawl Arena is a from-scratch redesign of the original two-fighter tutorial into a complete arcade-style fighting game.

This example expands the basic fighting game structure by adding advanced game architecture, character systems, AI, procedural audio, visual effects, and full game flow.

- **Game architecture** — the project is organized using classes and systems; `Game` controls the overall state machine, `Fighter` handles shared combat behavior, and subclasses (`Kaida`, `Torque`) provide unique character abilities
- **Game states** — the game uses multiple states (`MENU`, `SELECT`, `INTRO`, `FIGHT`, `ROUND_END`, `MATCH_END`, `PAUSED`, `SETTINGS`); each state controls what is drawn and what inputs are active
- **Object-oriented fighters** — the base `Fighter` class handles movement, physics, health, attacks, blocking, hit reactions, animation, and drawing; fighter subclasses extend the system with unique stats and special moves
- **Input system** — fighters receive commands through separate input sources; `HumanInput` handles keyboard controls while `AIInput` provides CPU-controlled behavior
- **Combat system** — includes health, meter, attacks, blocking, hit detection, knockback, hit stun, block stun, chip damage, combos, special attacks, and super attacks
- **Move data system** — attacks are stored as data objects containing startup, active frames, recovery, damage, range, knockback, and meter values; this keeps balancing separate from gameplay logic
- **AI opponent** — CPU fighters use a finite-state decision system to approach, retreat, defend, and attack based on distance, health, and available meter
- **Particle effects** — a reusable particle system creates hit sparks, block effects, landing dust, and movement trails
- **Camera effects** — the camera system adds screen shake and punch zoom effects during impactful moments without affecting UI elements
- **Procedural audio** — all sound effects and background music are generated using the Web Audio API; no external audio files are required
- **Animated stages** — each arena has its own theme, palette, and environmental effects including neon lights, desert formations, and storm particles

---

## Setup and Interaction Instructions

To run the sketch locally, open `index.html` in Google Chrome using Live Server.

No external assets are required because all visuals, animations, and audio are generated inside the sketch.

---

## Player Controls

### Player 1 Controls

| Action | Key |
|---|---|
| Move Left | A |
| Move Right | D |
| Jump | W |
| Block | S |
| Light Attack | F |
| Heavy Attack | G |
| Special Attack | T |
| Super Attack | R |

---

### Player 2 Controls

| Action | Key |
|---|---|
| Move Left | Left Arrow |
| Move Right | Right Arrow |
| Jump | Up Arrow |
| Block | Down Arrow |
| Light Attack | K |
| Heavy Attack | L |
| Special Attack | O |
| Super Attack | P |

---

### General Controls

| Action | Key |
|---|---|
| Pause / Resume | ESC |

---

## Characters

### Kaida

**Fast strikes. Fragile guard.**

Kaida is a speed-based fighter designed around aggressive play and combos.

Abilities:

- Faster movement speed
- Lower maximum health
- Dash-based special attack
- Multi-hit super attack
- Temporary invulnerability during super

---

### Torque

**Heavy hits. Slow feet.**

Torque is a powerful fighter focused on damage and defense.

Abilities:

- Higher maximum health
- Slower movement speed
- Ground slam special attack
- Armored charging super attack

---

## Game Systems

### Health System

Each fighter has:

- A maximum health value
- A health bar displayed in the HUD
- Damage received from successful attacks
- Blocking that reduces damage into chip damage

Health reaching zero causes a knockout.

---

### Meter System

Players build meter by:

- Dealing damage
- Receiving attacks
- Blocking

Meter can be spent on:

- Special attacks
- Super attacks

---

### Combat System

The combat system includes:

- Light attacks
- Heavy attacks
- Special attacks
- Super attacks
- Hit detection
- Hurtboxes
- Knockback physics
- Hit stun
- Block stun
- Combo tracking
- Super armor
- Multi-hit attacks

---

## Stages

The game includes three unique fighting arenas:

| Stage | Description |
|---|---|
| Neon Rooftop | Futuristic arena with glowing city lights and neon effects |
| Desert Ruins | Warm desert battlefield with moving sand formations |
| Storm Docks | Dark storm environment with rain and lightning effects |

---

## Audio System

All audio is generated procedurally using the Web Audio API.

Generated effects include:

- Light attack sounds
- Heavy attack impacts
- Special attack sounds
- Super attack sounds
- Blocking effects
- Jump sounds
- Landing sounds
- Knockout sounds
- Menu interaction sounds

Background music is generated dynamically using synthesized tones and randomized patterns.

---

## Visual Effects

### Particle System

The game uses particles for:

- Hit sparks
- Block sparks
- Dust effects
- Attack trails

Particles are reused through a centralized particle manager.

---

### Camera System

The camera adds:

- Screen shake after strong impacts
- Punch zoom during powerful attacks

The camera only affects the arena layer, keeping menus and HUD elements stable.

---

## Architecture Overview

The project is structured using reusable systems:

---

## File Structure

| File | Purpose |
|---|---|
| `index.html` | Loads the p5.js sketch |
| `sketch.js` | Contains all game logic and systems |
| `style.css` | Handles page styling |
| `README.md` | Project documentation |

---

## Development Notes

Blob Brawl Arena expands the original fighting game tutorial by adding:

- A complete arcade game loop
- Character selection
- Multiple fighters
- CPU opponent AI
- Unique fighter abilities
- Multiple stages
- Procedural audio
- Advanced visual effects
- Menu navigation
- Settings system
- Match tracking

The project was redesigned from a simple fighting prototype into a complete playable arcade fighting experience.

---

## References

- p5.js — JavaScript creative coding library  
  https://p5js.org/

- Web Audio API — Browser-based procedural audio system  
  https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API