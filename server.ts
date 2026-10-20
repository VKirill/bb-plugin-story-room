// Сценарная (story-room): a BB panel over a story repo laid out like Murdoku's `story/` — the tree of stories, seasons,
// cases and book chapters, each text with its header, history and check results, the canon, background runs of the
// story commands, and agent chats tied to a text. Everything about the story comes from the repo's own
// `tools/story/room.ts` on the machine that holds it (host.ts); this server only relays and starts chats.
import { defineRpcContract, type BbPluginApi, type JsonValue } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { hostContract } from "./contract.js";

const file = z.string().min(1).max(500).regex(/^[\w.\-/]+$/u).refine((f) => !f.split("/").includes(".."), "no ..");
const id = z.string().min(1).max(200).regex(/^[\w.:\-]+$/u);

export const TASKS = ["discuss", "chapter", "story", "fix"] as const;
export type Task = (typeof TASKS)[number];

export const rpcContract = defineRpcContract({
  tree: { input: z.null(), output: z.json() },
  read: { input: z.object({ file }), output: z.json() },
  canon: { input: z.object({ story: id }), output: z.json() },
  brief: { input: z.object({ at: id, story: id }), output: z.json() },
  run: { input: z.object({ action: z.enum(["check", "build", "style", "i18n", "test"]), only: z.string().max(500).regex(/^[\w.:\-/]*$/u).optional() }), output: z.json() },
  runs: { input: z.null(), output: z.json() },
  log: { input: z.object({ id }), output: z.json() },
  chat: {
    input: z.object({ task: z.enum(TASKS), file: file.optional(), title: z.string().max(200).optional(), text: z.string().max(4000).optional() }),
    output: z.object({ threadId: z.string() }),
  },
  chats: {
    input: z.object({ file: file.optional() }),
    output: z.object({ chats: z.array(z.object({ id: z.string(), title: z.string(), status: z.string(), file: z.string().nullable(), task: z.string().nullable(), createdAt: z.number() })) }),
  },
});

/** The first message of a chat started from the panel: the file, the task, the procedure to follow. */
function prompt(task: Task, f: string | undefined, title: string | undefined, text: string | undefined): string {
  const at = f ? `Файл: \`story/${f}\`${title ? ` («${title}»)` : ""}.` : "";
  const ask = text?.trim() ? `\n\n${text.trim()}` : "";
  const caseId = f?.match(/cases\/([^/]+)\.yaml$/)?.[1];
  const season = f?.match(/^([^/]+)\/seasons\/([^/]+)\//);
  switch (task) {
    case "chapter":
      return `${at}\n\nНапиши главу книги сезона после дела \`${caseId}\` по процедуре скилла mea-culpa-story: \`npm run story:new -- chapter ${season?.[1]}/${season?.[2]} ${caseId} "<название>"\`, бриф \`npm run story:brief -- ${caseId}\`, писатель — субагент Opus с ролью \`_room/roles/writer.md\`, затем \`npm run story\` и \`npm run story:check -- --only season:${season?.[2]}:book:\`. Покажи главу и итог проверки.${ask}`;
    case "story":
      return `Новая история. Проведи её по процедуре «A new story (1–5 seasons)» скилла mea-culpa-story: сначала спроси меня о замысле (жанр, время, место, сколько сезонов, кто рассказчик), потом предложи развязку всей истории и лестницу раскрытий по сезонам, и только после моего согласия создавай файлы.${ask}`;
    case "fix":
      return `${at}\n\nПроверка нашла расхождения с каноном в этом тексте. Проведи процедуру «A contradiction found» скилла mea-culpa-story: воспроизведи, реши, что верно (канон или текст), исправь минимально, перепроверь.${ask}`;
    default:
      return `${at}${ask || "\n\nРазберём этот текст: что в нём работает, что нет, что стоит проверить."}`;
  }
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    repo: { type: "string", label: "Story repo (absolute path on the host)", default: "" },
    host: { type: "string", label: "Host id (the machine with the repo)", default: "" },
    project: { type: "project", label: "Project for agent chats" },
    provider: { type: "string", label: "Agent provider", default: "claude-code" },
    model: { type: "string", label: "Agent model (empty — provider default)", default: "" },
  });
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const lifecycle = new AbortController();
  bb.onDispose(() => lifecycle.abort());

  async function room(...args: [string, ...string[]]): Promise<JsonValue> {
    const s = await settings.get();
    if (!s.repo || !s.host) throw new Error("Set the story repo path and host: bb plugin config story-room set repo <path>; … set host <host id>");
    return host.call("room", { repo: s.repo, args: args as never }, { hostId: s.host, signal: lifecycle.signal });
  }

  bb.rpc.register(rpcContract, {
    tree: () => room("tree"),
    read: ({ file }) => room("read", file),
    canon: ({ story }) => room("canon", story),
    brief: ({ at, story }) => room("brief", at, story),
    run: async ({ action, only }) => {
      const r = await room("run", action, ...(only ? [only] : []));
      bb.realtime.publish("runs", { action });
      return r;
    },
    runs: () => room("runs"),
    log: ({ id }) => room("log", id),
    chat: async ({ task, file, title, text }) => {
      const s = await settings.get();
      if (!s.project || !s.repo || !s.host) throw new Error("Set repo, host and project in the plugin settings");
      const thread = await bb.sdk.threads.spawn({
        projectId: String(s.project),
        environment: { type: "host", hostId: s.host, workspace: { type: "unmanaged", path: `${s.repo}/story` } },
        providerId: s.provider || undefined,
        model: s.model || undefined,
        title: task === "story" ? "Новая история" : `${title ?? file ?? "Сценарная"}${task === "chapter" ? " — новая глава" : task === "fix" ? " — правка" : ""}`,
        prompt: prompt(task, file, title, text),
        pluginMetadata: { file: file ?? null, task },
      });
      bb.realtime.publish("chats", { file: file ?? null });
      return { threadId: thread.id };
    },
    chats: async ({ file }) => {
      const s = await settings.get();
      if (!s.project) return { chats: [] };
      const threads = await bb.sdk.threads.list({ projectId: String(s.project), originPluginId: bb.pluginId, limit: 200 });
      if (!threads.length) return { chats: [] };
      const meta = await bb.sdk.threads.experimental_listPluginMetadata({ threadIds: threads.map((t) => t.id) });
      const by = new Map(meta.threads.map((m) => [m.threadId, m.metadata as { file?: string | null; task?: string | null }]));
      const chats = threads
        .map((t) => ({ id: t.id, title: t.title ?? "Без названия", status: t.status, createdAt: t.createdAt, file: by.get(t.id)?.file ?? null, task: by.get(t.id)?.task ?? null }))
        .filter((c) => !file || c.file === file)
        .sort((a, b) => b.createdAt - a.createdAt);
      return { chats };
    },
  });
}
