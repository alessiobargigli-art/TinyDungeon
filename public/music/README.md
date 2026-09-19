# Dungeon music

Place background music files in this folder and list their filenames in `manifest.json`.

Example:

```json
{
  "tracks": [
    "dungeon-adventure.mp3",
    "magical-dungeon.mp3",
    "tiny-heroes.mp3"
  ]
}
```

At the start of a dungeon/campaign TinyDungeon chooses one listed track at random and keeps that same track looping across all rooms. When a new dungeon starts, it chooses again and avoids the previous track when alternatives exist.
