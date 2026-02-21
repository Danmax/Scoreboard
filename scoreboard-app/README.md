# Scoreboard Framework App

Incremental migration target for the scoreboard project.

## What this includes

- Vite + React + TypeScript scaffold
- Typed scoreboard store
- Legacy compatibility layer:
  - Reads/writes `basketball_scoreboard_state_v3`
  - Reads/writes `basketball_scoreboard_state_v5b`
  - Consumes `scoreboard_command` commands used by `timeControl.html` and `refereeControl.html`
- Migrated React workflows:
  - Scoreboard and clock controls
  - Player stat tracking and foul-out logic
  - Substitution modal and on-court constraints
  - Roster editing (add/update/delete)
  - Play-by-play action log
  - Timeout and halftime fullscreen overlays (countdown + end early)
  - Game Manager Dashboard:
    - Create teams and manage players
    - Schedule games and update live/final scores
    - Create tournaments and auto-generate tournament games
    - View standings and operational summary stats
  - Team Stats Mode (multi-screen):
    - Dedicated pages for stats entry, timekeeping, substitutions, TV display, and recap
    - Open each page in separate browser tabs/screens while sharing one live game state
    - Save and share/copy game recaps
  - Team branding:
    - Team logo URL support
    - Color picker and color extraction from team logo image URL
    - Soft team color tinting on Home/Away panels and TV display cards

## Run locally

```bash
cd scoreboard-app
npm install
npm run dev
```

## Migration plan

1. Replace polling-based legacy HTML pages with dedicated React routes/views.
2. Add settings panel parity from `V4.html` (period count, foul limit, timing mode).
3. Retire old static pages once all workflows are ported.
