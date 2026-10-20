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
  run: { input: z.object({ action: z.enum(["check", "build", "style", "i18n", "test", "chain", "continuity"]), only: z.string().max(500).regex(/^[\w.:\-/]*$/u).optional() }), output: z.json() },
  runs: { input: z.null(), output: z.json() },
  log: { input: z.object({ id }), output: z.json() },
  chat: {
    input: z.object({ task: z.enum(TASKS), file: file.optional(), title: z.string().max(200).optional(), text: z.string().max(4000).optional() }),
    output: z.object({ threadId: z.string() }),
  },
  /** A hidden worker thread of an agent chain (tools/story/chain.ts): the role picks the model from models.yaml `threads`. */
  worker: {
    input: z.object({ role: id, files: z.array(z.string().max(500)).max(100), job: id, title: z.string().max(200), prompt: z.string().min(1).max(20000) }),
    output: z.object({ threadId: z.string(), model: z.string() }),
  },
  /** Roles of the agent threads and the providers and models BB offers on the repo's host. */
  models: { input: z.null(), output: z.object({ roles: z.record(z.string(), z.string()), providers: z.array(z.object({ id: z.string(), name: z.string(), models: z.array(z.object({ id: z.string(), name: z.string() })) })) }) },
  models_set: { input: z.object({ role: id, spec: z.string().regex(/^[\w.-]+\/[\w.-]+$/u) }), output: z.json() },
  chats: {
    input: z.object({ file: file.optional() }),
    output: z.object({ chats: z.array(z.object({ id: z.string(), title: z.string(), status: z.string(), file: z.string().nullable(), files: z.array(z.string()), task: z.string().nullable(), job: z.string().nullable(), hidden: z.boolean(), createdAt: z.number() })) }),
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
  });
  const host = bb.hosts.experimental_client({ contract: hostContract });
  const lifecycle = new AbortController();
  bb.onDispose(() => lifecycle.abort());

  async function room(...args: [string, ...string[]]): Promise<JsonValue> {
    const s = await settings.get();
    if (!s.repo || !s.host) throw new Error("Set the story repo path and host: bb plugin config story-room set repo <path>; … set host <host id>");
    return host.call("room", { repo: s.repo, args: args as never }, { hostId: s.host, signal: lifecycle.signal });
  }

  /** Spawns an agent thread in <repo>/story with the model of its role (story/_room/models.yaml `threads`). */
  async function spawn(role: string, args: { title: string; prompt: string; metadata: Record<string, JsonValue>; hidden: boolean }) {
    const s = await settings.get();
    if (!s.project || !s.repo || !s.host) throw new Error("Set repo, host and project in the plugin settings");
    const roles = (await room("models")) as Record<string, string>;
    const spec = roles[role];
    if (!spec) throw new Error(`No model for the role «${role}» in story/_room/models.yaml threads`);
    const [providerId, model] = spec.split("/");
    const thread = await bb.sdk.threads.spawn({
      projectId: String(s.project),
      environment: { type: "host", hostId: s.host, workspace: { type: "unmanaged", path: `${s.repo}/story` } },
      providerId,
      model,
      permissionMode: args.hidden ? "full" : undefined,
      visibility: args.hidden ? "hidden" : "visible",
      title: args.title,
      prompt: args.prompt,
      pluginMetadata: { ...args.metadata, task: role === "showrunner" ? args.metadata.task ?? null : role },
    });
    bb.realtime.publish("chats", {});
    return { threadId: thread.id, model: spec };
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
      const { threadId } = await spawn("showrunner", {
        title: task === "story" ? "Новая история" : `${title ?? file ?? "Сценарная"}${task === "chapter" ? " — новая глава" : task === "fix" ? " — правка" : ""}`,
        prompt: prompt(task, file, title, text),
        metadata: { file: file ?? null, files: file ? [file] : [], task },
        hidden: false,
      });
      return { threadId };
    },
    worker: ({ role, files, job, title, prompt: text }) => spawn(role, { title, prompt: text, metadata: { file: files.length === 1 ? files[0] : null, files, job }, hidden: true }),
    models: async () => {
      const s = await settings.get();
      const roles = (await room("models")) as Record<string, string>;
      const listed = await bb.sdk.providers.list();
      const providers = await Promise.all(
        listed.map(async (p) => {
          const catalog = await bb.sdk.providers.models({ hostId: s.host, providerId: p.id }).catch(() => null);
          return { id: p.id, name: p.displayName, models: (catalog?.models ?? []).map((m) => ({ id: m.model, name: m.displayName })) };
        }),
      );
      return { roles, providers: providers.filter((p) => p.models.length) };
    },
    models_set: ({ role, spec }) => room("models-set", role, spec),
    chats: async ({ file }) => {
      const s = await settings.get();
      if (!s.project) return { chats: [] };
      const threads = await bb.sdk.threads.list({ projectId: String(s.project), originPluginId: bb.pluginId, includeHidden: true, limit: 500 });
      if (!threads.length) return { chats: [] };
      // BB returns plugin metadata for at most 200 threads per call.
      const ids = threads.map((t) => t.id);
      const pages = await Promise.all(Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) => bb.sdk.threads.experimental_listPluginMetadata({ threadIds: ids.slice(i * 200, i * 200 + 200) })));
      const meta = { threads: pages.flatMap((p) => p.threads) };
      const by = new Map(meta.threads.map((m) => [m.threadId, m.metadata as { file?: string | null; files?: string[]; task?: string | null; job?: string | null }]));
      const chats = threads
        .map((t) => {
          const m = by.get(t.id);
          return { id: t.id, title: t.title ?? "Без названия", status: t.status, createdAt: t.createdAt, file: m?.file ?? null, files: m?.files ?? (m?.file ? [m.file] : []), task: m?.task ?? null, job: m?.job ?? null, hidden: t.visibility === "hidden" };
        })
        .filter((c) => !file || c.files.includes(file))
        .sort((a, b) => b.createdAt - a.createdAt);
      return { chats };
    },
  });
}
