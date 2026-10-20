---
name: story-room
description: The BB panel «Сценарная» (plugin story-room) over a story repo such as Murdoku — what it shows, where its data comes from, how its buttons start checks and agent chats. Use when the owner mentions the panel «Сценарная», asks why it shows a finding or a status, or wants a chat opened from it.
---

# Сценарная (story-room)

The panel lives at `/plugins/story-room/story`. It shows the story repo set in the plugin settings (`bb plugin config story-room`: `repo`, `host`, `project`, `provider`, `model`).

## Where its data comes from
Everything about the story comes from the repo itself. The plugin's host entry runs `node tools/story/room.ts <command>` in the repo:
- `tree` returns stories, seasons, cases, book chapters, plans, series, films and docs with their `meta.status`. It also gives the number of findings per text.
- `read <file under story/>` returns one text as Markdown, plus its `meta` (status, canon links, history), its check units, the findings of the last check (`story/.cache/report-<story>.json`) and its style scores (`story/.cache/style.json`).
- `canon <story>`, `brief <case> <story>` return the canon and a writer's brief.
- `run check|build|style|i18n|test [only]`, `runs` and `log <id>` start a command in the background and read it back. Logs are in `story/.cache/runs/`.

If the panel shows something wrong, fix the repo: the text, the canon or `tools/story/room.ts`. Do not work around it in the plugin.

## Buttons
- **Проверить** runs `node tools/story/check.ts --only <unit>` for that text.
- **Бриф** opens `tools/story/brief.ts <case>`.
- **Новая глава**, **Исправить** and **Обсудить** start a visible chat for the agent in `<repo>/story`. That folder is the BB section «Сценарная», whose `AGENTS.md` holds the showrunner prompt. The first message names the file and the task. The chat carries plugin metadata `{file, task}`, so the text's page lists it under «Обсуждения».
- **Новая история** starts a chat that plans a story of 1–5 seasons by the `mea-culpa-story` skill.
