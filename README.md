# Missile Commander Web

A browser remake of the classic **Missile Command** arcade game, built with
[Phaser 3](https://phaser.io/). Defend six cities and three missile silos
against waves of enemy missiles, UFOs and smart bombs.

**▶ Play online:** https://www.hrdinovefantasy.cz/demo/missile/

## Features

- Three silos with visible ammo pyramids, six procedurally drawn cities
- Phases of 10 waves, each wave with its own colour scheme
- Special waves: **UFO attack** (wave 5) and **smart bomb rain** (wave 10)
- Enemy missiles that split in the air (MIRV), smart bombs that dodge explosions
- Three UFO types – saucer, scout and a two-hit mothership that drops smart bombs
- Doomsday missile that clears the whole screen
- End-of-wave recap with bonuses, *perfect defense* bonus, bonus cities
- Mushroom-cloud city hits, pulsing warheads, boiling explosion clouds
- Synthesised sound effects (Web Audio, no audio files)
- Title screen with start-wave picker, high score table, settings
  (key bindings, volume, wave start sound) and a wave parameter table
- Mercy rule: each wave targets at most 3 cities

## Controls

| Action | Default |
| --- | --- |
| Fire from the nearest silo | Left click |
| Fire from left / centre / right silo | Q / W / E |
| Doomsday missile | T or right click |
| Pause | P or Esc |

All keys can be changed in **Settings** on the title screen.

## Running locally

No build step is needed – the game is plain JavaScript with Phaser bundled in
`lib/`. Serve the folder with any static web server, for example:

```bash
npm install
npm run dev          # Vite dev server
```

or simply `npx serve .` / `python -m http.server` and open the printed URL.
(Opening `index.html` directly from disk may not work in all browsers.)

## Deploying

```bash
npm run dist         # creates dist/
```

Upload the contents of `dist/` (`index.html`, `.htaccess`, `lib/`, `src/`)
to any folder on a web server. All paths are relative, so it works in a
sub-folder such as `/demo/missile/`. The repository root also works as-is,
e.g. on **GitHub Pages** (Settings → Pages → deploy from branch `main`, root).

## Project structure

```
index.html          entry page (relative paths)
src/main.js         the whole game (scenes, entities, sound, settings)
lib/phaser.min.js   Phaser 3.90 (MIT, see lib/PHASER-LICENSE.md)
build-dist.mjs      creates the deployable dist/ folder
```

Game balance (speeds, missile counts, points, UFO types …) is configured by
constants at the top of `src/main.js`.

## Credits

- Built with [Phaser](https://phaser.io/) – MIT licence, © Phaser Studio Inc.
- Inspired by *Missile Command* (Atari, 1980). This is an independent fan
  project and is not affiliated with or endorsed by Atari.
