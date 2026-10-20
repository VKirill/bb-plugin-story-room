# Сценарная (story-room)

A BB panel for a writers' room. It reads a story repo laid out like the `story/` folder of the Murdoku game: one folder per story, YAML and Markdown files with a `meta` header, and a canon. The panel shows:

- a tree of stories → seasons → cases, book chapters and plans, plus case-file series and films. Each item has its status and its continuity findings;
- one text, readable, with its header, its links to the canon, its edit history (`meta.history`), the findings of the last check with quotes, its style scores, and the agent chats about it;
- the canon: people with roles by case, fates and attributes; threads; facts and when the player learns them; the timeline;
- runs of the story commands (check, build, style, translations, tests) in the background, with their logs.

Buttons on a text: **Проверить**, **Бриф**, **Новая глава**, **Исправить**, **Обсудить**. On the overview: **Новая история**. A chat starts in `<repo>/story`, so the agent reads that folder's `AGENTS.md`.

## How it works

The plugin knows nothing about the story format. Its host entry runs the repo's own `node tools/story/room.ts <command>` on the machine that holds the repo and passes the JSON on. The commands are `tree`, `read`, `canon`, `brief`, `run`, `runs` and `log`. The server relays these calls and starts chats with `bb.sdk.threads.spawn`.

## Install

```sh
bb plugin install <path or git URL> --yes
bb plugin config story-room set repo /absolute/path/to/repo
bb plugin config story-room set host <host id>        # bb host list
bb plugin config story-room set project <project id>
bb plugin config story-room set model claude-opus-5-5 # optional; empty = provider default
```

## Develop

```sh
npm install
npm run typecheck
bb plugin build .
```
