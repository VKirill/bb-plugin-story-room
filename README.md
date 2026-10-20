# Сценарная (story-room)

A BB panel for a writers' room. It reads a story repo laid out like the `story/` folder of the Murdoku game: one folder per story, YAML and Markdown files with a `meta` header, and a canon. The panel shows:

- a tree of stories → seasons → cases, book chapters and plans, plus case-file series and films. Each item has its status and its continuity findings;
- one text, readable, with its header, its links to the canon, its edit history (`meta.history`), the findings of the last check with quotes, its style scores, and the agent chats about it;
- the canon: people with roles by case, fates and attributes; threads; facts and when the player learns them; the timeline;
- runs of the story commands (check, build, style, translations, tests) in the background, with their logs.

Buttons on a text: **Проверить**, **Бриф**, **Новая глава**, **Исправить**, **Обсудить**. On the overview: **Новая история**. A chat starts in `<repo>/story`, so the agent reads that folder's `AGENTS.md`.

## Agent threads and models

Every model call of the story room is a BB thread on a subscription, so the whole history stays readable:

- **Panel chats** (Обсудить, Новая глава, Исправить, Новая история) open a visible thread for the role `showrunner`.
- **The editing chain** of the repo (`tools/story/chain.ts`) asks the plugin for hidden worker threads through the RPC `worker`. A critic writes a brief, an editor edits the files by the brief, and a judge accepts or sends back. A checker covers continuity. Each worker thread carries `{files, job, task}` metadata, so a text's page lists every step under «Обсуждения» with its role.
- **Which model plays which role** is set in Settings → Сценарная → «Модели агентов». The list offers the providers and models BB has on the repo's host. The choice is stored in the repo, in `story/_room/models.yaml` under `threads`.

## How it works

The plugin knows nothing about the story format. Its host entry runs the repo's own `node tools/story/room.ts <command>` on the machine that holds the repo and passes the JSON on. The commands are `tree`, `read`, `canon`, `brief`, `run`, `runs`, `log`, `models` and `models-set`. The server relays these calls and starts chats with `bb.sdk.threads.spawn`.

## Install

```sh
bb plugin install <path or git URL> --yes
bb plugin config story-room set repo /absolute/path/to/repo
bb plugin config story-room set host <host id>        # bb host list
bb plugin config story-room set project <project id>
```

## Develop

```sh
npm install
npm run typecheck
bb plugin build .
```
