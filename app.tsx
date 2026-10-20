// Сценарная: the tree of stories on the left, the chosen text (or the canon, the runs, the chats) on the right.
// The route remainder is the view: "" overview · file/<path> · brief/<story>/<case> · canon/<story> · runs · run/<id> · chats.
import "./app.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { definePluginApp, Markdown, useBbNavigate, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import type { Canon, Chat, Node, Run, Story, Text } from "./types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { cn } from "@/lib/utils";

type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;
const PATH = "story";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Loads one RPC result and reloads it on demand; null while loading. */
function useLoad<T>(load: () => Promise<unknown>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    load().then((d) => { setData(d as T); setError(null); }, (e) => setError(errorText(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { setData(null); reload(); }, [reload]);
  return { data, error, reload };
}

const STATUS: Record<string, string> = {
  plan: "sr-pill-muted", outline: "sr-pill-muted", draft: "sr-pill-warning", solved: "sr-pill-info", canon: "sr-pill-info",
  checked: "sr-pill-info", edited: "sr-pill-info", translated: "sr-pill-info", art: "sr-pill-info", released: "sr-pill-success",
};
const Status = ({ s }: { s: string }) => <span className={cn("sr-pill", STATUS[s] ?? "sr-pill-neutral")}>{s}</span>;

/** A finding count: red with a number, green dot when checked and clean, nothing when never checked. */
function Mark({ n, checked }: { n: number; checked: boolean }) {
  if (n > 0) return <span className="sr-pill sr-pill-danger font-mono tabular-nums">{n}</span>;
  return checked ? <span className="size-2 shrink-0 rounded-full bg-[var(--sr-success)]" title="проверено, чисто" /> : null;
}

function Empty({ children }: { children: ReactNode }) {
  return <div role="status" className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function Panel({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="sr-panel">
      <div className="sr-panel-head flex items-center justify-between gap-2"><h2 className="text-sm font-medium">{title}</h2>{actions}</div>
      <div className="sr-panel-body">{children}</div>
    </section>
  );
}

// ——— the tree ———

function Row({ node, open, active }: { node: { file: string; title: string; status?: string; findings?: number; checked?: boolean }; open: (sub: string) => void; active: string }) {
  return (
    <button
      type="button"
      aria-current={active === `file/${node.file}` ? "page" : undefined}
      onClick={() => open(`file/${node.file}`)}
      className="sr-nav-item flex w-full min-w-0 items-center gap-2 px-2 py-1 text-left text-sm"
    >
      <span className="min-w-0 flex-1 truncate">{node.title}</span>
      <Mark n={node.findings ?? 0} checked={node.checked ?? false} />
      {node.status ? <Status s={node.status} /> : null}
    </button>
  );
}

function Group({ title, children, defaultOpen = false }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center gap-1 px-1 py-1 text-xs font-medium text-muted-foreground">
        <Icon name="ChevronRight" className="sr-chev size-3 transition-transform" />
        {title}
      </summary>
      <div className="ml-3 border-l border-border pl-1">{children}</div>
    </details>
  );
}

function Tree({ stories, open, active }: { stories: Story[]; open: (sub: string) => void; active: string }) {
  return (
    <div className="space-y-2">
      {stories.map((s) => (
        <Group key={s.id} defaultOpen title={<span className="flex items-center gap-2 text-sm text-foreground">{s.title} <Status s={s.status} /></span>}>
          {s.canon ? <Row node={{ file: `${s.id}/canon.yaml`, title: "Канон" }} open={() => open(`canon/${s.id}`)} active={active.replace(`canon/${s.id}`, `file/${s.id}/canon.yaml`)} /> : null}
          <Row node={{ file: `${s.id}/story.yaml`, title: "Паспорт истории" }} open={open} active={active} />
          {s.docs.map((d) => <Row key={d.file} node={d} open={open} active={active} />)}
          {s.seasons.map((se) => (
            <Group key={se.id} title={<span className="flex items-center gap-2">{se.title} <Status s={se.status} /> <Mark n={se.findings + [...se.cases, ...se.chapters].reduce((n, c) => n + c.findings, 0)} checked={false} /></span>}>
              {se.file ? <Row node={{ file: se.file, title: "Сезон: логлайн, записки, финалы", findings: se.findings }} open={open} active={active} /> : null}
              {se.plans.map((p) => <Row key={p.file} node={{ ...p, title: `План: ${p.title}` }} open={open} active={active} />)}
              {se.cases.length ? <Group title={`Дела · ${se.cases.length}`}>{se.cases.map((c) => <Row key={c.file} node={c} open={open} active={active} />)}</Group> : null}
              {se.chapters.length ? <Group title={`Книга · ${se.chapters.length}`}>{se.chapters.map((c, i) => <Row key={c.file} node={{ ...c, title: `${i + 1}. ${c.title}` }} open={open} active={active} />)}</Group> : null}
            </Group>
          ))}
          {s.series.length ? (
            <Group title={`Серии · ${s.series.length}`}>
              {s.series.map((x) => (
                <Group key={x.id} title={<span className="flex items-center gap-2">{x.title} <Status s={x.status} /></span>}>
                  {x.files.map((f) => <Row key={f} node={{ file: f, title: f.split("/").pop()!.replace(".yaml", "") }} open={open} active={active} />)}
                </Group>
              ))}
            </Group>
          ) : null}
          {s.films.length ? <Group title={`Ролики · ${s.films.length}`}>{s.films.map((f) => <Row key={f.file} node={f} open={open} active={active} />)}</Group> : null}
        </Group>
      ))}
    </div>
  );
}

// ——— one text ———

/** The check units of a text, as `--only` prefixes for tools/story/check.ts. */
const onlyOf = (t: Text) => (t.units.length === 1 ? t.units[0] : t.units.find((u) => u.startsWith("case:")) ?? t.units[0]);

function TextView({ rpc, file, open, chats }: { rpc: Rpc; file: string; open: (sub: string) => void; chats: Chat[] }) {
  const { data: t, error, reload } = useLoad<Text>(() => rpc.call("read", { file }), [rpc, file]);
  const [ask, setAsk] = useState("");
  const navigate = useBbNavigate();
  useRealtime("runs", reload);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!t) return <Empty>Загружаю…</Empty>;
  const found = t.checks.flatMap((c) => c.findings);
  const lastCheck = t.checks.map((c) => c.at).sort().at(-1);
  const chat = async (task: "discuss" | "chapter" | "fix") => {
    try {
      const { threadId } = await rpc.call("chat", { task, file: t.file, title: t.title, text: ask || undefined });
      setAsk("");
      navigate.toThread(threadId);
    } catch (e) { toast.error(errorText(e)); }
  };
  const check = async () => {
    try {
      await rpc.call("run", { action: "check", only: onlyOf(t) });
      toast.success("Проверка запущена — ход во вкладке «Запуски»");
    } catch (e) { toast.error(errorText(e)); }
  };
  const isCase = /\/cases\/[^/]+\.yaml$/.test(t.file);
  const mine = chats.filter((c) => c.file === t.file);
  return (
    <div className="space-y-4">
      <div className="sr-strip space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-medium">{t.title}</h1>
          {t.meta ? <Status s={t.meta.status} /> : null}
        </div>
        <p className="break-all font-mono text-xs text-muted-foreground">story/{t.file}{t.meta?.updated ? ` · обновлён ${t.meta.updated}` : ""}{t.meta?.slot ? ` · ${t.meta.slot}` : ""}</p>
        <div className="flex flex-wrap gap-2">
          {t.units.length ? <Button size="sm" className="sr-accent" onClick={check}><Icon name="SecurityCheck" />Проверить</Button> : null}
          {t.at ? <Button size="sm" variant="outline" className="sr-raised" onClick={() => open(`brief/${t.story}/${t.at}`)}><Icon name="FileText" />Бриф</Button> : null}
          {isCase ? <Button size="sm" variant="outline" className="sr-raised" onClick={() => chat("chapter")}><Icon name="EditFile" />Новая глава</Button> : null}
          {found.length ? <Button size="sm" variant="outline" className="sr-raised" onClick={() => chat("fix")}><Icon name="Edit" />Исправить</Button> : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="Вопрос или задача агенту по этому тексту" aria-label="Задача агенту" />
          <Button size="sm" variant="outline" className="sr-raised" onClick={() => chat("discuss")}><Icon name="MessageSquare" />Обсудить</Button>
        </div>
      </div>

      <Panel title={`Проверка непрерывности${lastCheck ? ` · ${lastCheck.slice(0, 16).replace("T", " ")}` : ""}`}>
        {!t.units.length ? <p className="text-sm text-muted-foreground">Этот файл проверка не читает.</p>
          : !t.checks.length ? <p className="text-sm text-muted-foreground">Ещё не проверялся.</p>
          : !found.length ? <p className="sr-text-success text-sm">Расхождений с каноном нет ({t.checks.length} {t.checks.length === 1 ? "фрагмент" : "фрагм."}).</p>
          : (
            <ul className="space-y-3">
              {found.map((f, i) => (
                <li key={i} className="space-y-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><span className="sr-pill sr-pill-danger">{f.kind}</span><span className="font-mono text-xs text-muted-foreground">{f.unit} · {f.layer}</span></div>
                  <blockquote className="border-l-2 border-border pl-2">«{f.quote}»</blockquote>
                  {f.canon ? <p className="text-xs text-muted-foreground">Канон: {f.canon}</p> : null}
                  <p>{f.why}</p>
                  {f.fix ? <p className="text-xs text-muted-foreground">Как исправить: {f.fix}</p> : null}
                </li>
              ))}
            </ul>
          )}
      </Panel>

      {t.style.length ? (
        <Panel title="Стиль (похоже ли на книгу, а не на текст нейросети)">
          <ul className="space-y-2 text-sm">
            {t.style.map((s) => (
              <li key={s.path}>
                <span className="font-mono text-xs text-muted-foreground">{s.path}</span> · <span className={cn("font-mono tabular-nums", s.score >= 0.25 ? "sr-text-warning" : "sr-text-success")}>{s.score.toFixed(2)}</span>
                {s.flagged.length ? <span className="text-xs text-muted-foreground"> — {s.flagged.map((m) => m.id).join(", ")}</span> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel title="Текст">
        <Markdown content={t.body} className="text-sm" />
      </Panel>

      {t.meta?.canon && Object.values(t.meta.canon).some((v) => v?.length) ? (
        <Panel title="Связи с каноном">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {(["plants", "pays", "reveals"] as const).map((k) => t.meta?.canon?.[k]?.length ? (
              <div key={k} className="contents"><dt className="text-muted-foreground">{{ plants: "Подбрасывает", pays: "Закрывает", reveals: "Раскрывает" }[k]}</dt><dd className="flex flex-wrap gap-1">{t.meta.canon[k]!.map((id) => <span key={id} className="sr-pill sr-pill-neutral font-mono">{id}</span>)}</dd></div>
            ) : null)}
          </dl>
        </Panel>
      ) : null}

      <Panel title={`История правок · ${t.meta?.history?.length ?? 0}`}>
        {t.meta?.history?.length ? (
          <ol className="space-y-1 text-sm">
            {[...t.meta.history].reverse().map((h, i) => (
              <li key={i} className="flex flex-wrap gap-x-2"><span className="font-mono text-xs tabular-nums text-muted-foreground">{h.at}</span><span className="font-medium">{h.role}</span>{h.model ? <span className="font-mono text-xs text-muted-foreground">{h.model}</span> : null}{h.note ? <span className="w-full text-muted-foreground">{h.note}</span> : null}</li>
            ))}
          </ol>
        ) : <p className="text-sm text-muted-foreground">Записей нет.</p>}
      </Panel>

      <Panel title={`Обсуждения этого текста · ${mine.length}`}>
        <ChatList chats={mine} />
      </Panel>
    </div>
  );
}

/** Roles of the agent threads, as the owner reads them. */
const ROLE: Record<string, string> = { showrunner: "шоураннер", critic: "критик", checker: "проверка", editor: "редактор", judge: "судья", discuss: "обсуждение", chapter: "новая глава", fix: "правка", story: "новая история" };

/** Settings: which model plays which role (story/_room/models.yaml `threads`), from the providers BB has on the repo's host. */
function ModelsSettings() {
  const rpc = useRpc<typeof rpcContract>();
  const { data, error, reload } = useLoad<{ roles: Record<string, string>; providers: { id: string; name: string; models: { id: string; name: string }[] }[] }>(() => rpc.call("models", null), [rpc]);
  const save = async (role: string, spec: string) => {
    try { await rpc.call("models_set", { role, spec }); toast.success(`${ROLE[role] ?? role}: ${spec}`); reload(); } catch (e) { toast.error(errorText(e)); }
  };
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!data) return <Empty>Загружаю…</Empty>;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Каждая роль — тред BB на этой модели по подписке. Цепочка правки: критик пишет ТЗ, редактор правит файл по ТЗ, судья принимает или откатывает; шоураннер ведёт чаты из панели. Хранится в story/_room/models.yaml.</p>
      {Object.entries(data.roles).map(([role, spec]) => {
        const [provider, model] = spec.split("/");
        const models = data.providers.find((p) => p.id === provider)?.models ?? [];
        return (
          <div key={role} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-28 font-medium">{ROLE[role] ?? role}</span>
            <select aria-label={`Провайдер: ${ROLE[role] ?? role}`} className="sr-raised rounded-md bg-transparent px-2 py-1" value={provider} onChange={(e) => { const m = data.providers.find((p) => p.id === e.target.value)?.models[0]; if (m) save(role, `${e.target.value}/${m.id}`); }}>
              {data.providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select aria-label={`Модель: ${ROLE[role] ?? role}`} className="sr-raised rounded-md bg-transparent px-2 py-1" value={model} onChange={(e) => save(role, `${provider}/${e.target.value}`)}>
              {models.some((m) => m.id === model) ? null : <option value={model}>{model}</option>}
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        );
      })}
    </div>
  );
}

function ChatList({ chats }: { chats: Chat[] }) {
  const navigate = useBbNavigate();
  if (!chats.length) return <p className="text-sm text-muted-foreground">Пока нет. Кнопки «Обсудить», «Новая глава» и «Исправить» открывают чат агента «Сценарной».</p>;
  return (
    <ul className="divide-y divide-border">
      {chats.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => navigate.toThread(c.id)} className="flex w-full items-center gap-2 py-2 text-left text-sm hover:text-foreground">
            <Icon name="MessageSquare" className="size-4 text-muted-foreground" />
            {c.task && ROLE[c.task] ? <span className={cn("sr-pill", c.hidden ? "sr-pill-muted" : "sr-pill-info")}>{ROLE[c.task]}</span> : null}
            <span className="min-w-0 flex-1 truncate">{c.title}</span>
            {c.file ? <span className="hidden truncate font-mono text-xs text-muted-foreground md:inline">{c.file}</span> : null}
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ——— brief, canon, runs ———

function BriefView({ rpc, story, at }: { rpc: Rpc; story: string; at: string }) {
  const { data, error } = useLoad<{ markdown: string }>(() => rpc.call("brief", { at, story }), [rpc, story, at]);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  return data ? <div className="sr-card p-4"><Markdown content={data.markdown} className="text-sm" /></div> : <Empty>Собираю бриф…</Empty>;
}

function CanonView({ rpc, story }: { rpc: Rpc; story: string }) {
  const { data: c, error } = useLoad<Canon>(() => rpc.call("canon", { story }), [rpc, story]);
  const [q, setQ] = useState("");
  const hit = useCallback((...s: (string | undefined)[]) => !q || s.some((x) => x?.toLowerCase().includes(q.toLowerCase())), [q]);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  if (!c) return <Empty>Загружаю канон…</Empty>;
  const people = c.people.filter((p) => hit(p.name, p.id, ...Object.values(p.roles)));
  const facts = c.facts.filter((f) => hit(f.text, f.id, f.since));
  const threads = c.threads.filter((t) => hit(t.text, t.id, t.how));
  return (
    <div className="space-y-4">
      <div className="sr-strip space-y-2">
        <h1 className="text-xl font-medium">Канон · {c.story}</h1>
        <p className="text-xs text-muted-foreground">{c.order.length} дел в порядке игры · {c.people.length} людей · {c.facts.length} фактов · {c.threads.length} нитей</p>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: имя, дело, слово" aria-label="Поиск по канону" />
      </div>
      <Panel title={`Люди · ${people.length}`}>
        <ul className="divide-y divide-border">
          {people.map((p) => (
            <li key={p.id}>
              <details className="py-1.5">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium">{p.name}</span><span className="font-mono text-xs text-muted-foreground">{p.id}</span>
                  {p.fate.map((f, i) => <span key={i} className={cn("sr-pill", /убит/.test(f.state) ? "sr-pill-danger" : "sr-pill-warning")}>{f.state} · {f.after}</span>)}
                  <span className="ml-auto text-xs text-muted-foreground">дел: {Object.keys(p.roles).length}</span>
                </summary>
                <div className="mt-1 space-y-1 pl-2 text-sm">
                  {Object.entries(p.roles).sort(([a], [b]) => c.order.indexOf(a) - c.order.indexOf(b)).map(([k, r]) => <p key={k}><span className="font-mono text-xs text-muted-foreground">{k}</span> — {r}</p>)}
                  {p.attrs.map((a, i) => <p key={i} className="text-muted-foreground">{a.field}: {a.value} ({a.from}{a.until ? ` → ${a.until}` : ""})</p>)}
                  {p.fate.filter((f) => f.note).map((f, i) => <p key={i} className="text-muted-foreground">{f.state}: {f.note}</p>)}
                  {p.knows.map((k, i) => <p key={i} className="text-muted-foreground">знает с {k.since}: {k.what}</p>)}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={`Нити · ${threads.length}`}>
        <ul className="space-y-2 text-sm">
          {threads.map((t) => <li key={t.id}><p>{t.text}</p><p className="text-xs text-muted-foreground"><span className="font-mono">{t.planted} → {t.resolved}</span> · {t.how}</p></li>)}
        </ul>
      </Panel>
      <Panel title={`Факты · ${facts.length}`}>
        <ul className="space-y-2 text-sm">
          {facts.map((f) => <li key={f.id}><p>{f.text}</p><p className="text-xs text-muted-foreground">игрок узнаёт в <span className="font-mono">{f.since}</span>{f.keys?.length ? ` · до этого нельзя: ${f.keys.join(", ")}` : ""}</p></li>)}
        </ul>
      </Panel>
      <Panel title={`Хронология · ${c.timeline.length}`}>
        <ul className="space-y-1 text-sm">{c.timeline.map((e, i) => <li key={i}><span className="font-mono text-xs tabular-nums text-muted-foreground">{e.when}</span> — {e.event}</li>)}</ul>
      </Panel>
    </div>
  );
}

const ACTIONS = [
  { action: "check", label: "Проверить всё", icon: "SecurityCheck" },
  { action: "build", label: "Собрать (npm run story)", icon: "Layers" },
  { action: "style", label: "Стиль", icon: "Palette" },
  { action: "i18n", label: "Переводы", icon: "Globe" },
  { action: "test", label: "Тесты", icon: "Beaker" },
  { action: "chain", label: "Цепочка правки", icon: "EditFile" },
  { action: "continuity", label: "Непрерывность картотеки", icon: "SecurityCheck" },
] as const;

function RunsView({ rpc, open }: { rpc: Rpc; open: (sub: string) => void }) {
  const { data: runs, error, reload } = useLoad<Run[]>(() => rpc.call("runs", null), [rpc]);
  useRealtime("runs", reload);
  const running = runs?.some((r) => !r.done) ?? false;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [running, reload]);
  const start = async (action: (typeof ACTIONS)[number]["action"]) => {
    try { await rpc.call("run", { action }); reload(); } catch (e) { toast.error(errorText(e)); }
  };
  return (
    <div className="space-y-4">
      <div className="sr-strip space-y-2">
        <h1 className="text-xl font-medium">Запуски</h1>
        <p className="text-xs text-muted-foreground">Команды идут в фоне на машине с репозиторием; журнал — story/.cache/runs/.</p>
        <div className="flex flex-wrap gap-2">{ACTIONS.map((a) => <Button key={a.action} size="sm" variant="outline" className="sr-raised" onClick={() => start(a.action)}><Icon name={a.icon} />{a.label}</Button>)}</div>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {!runs ? <Empty>Загружаю…</Empty> : !runs.length ? <Empty>Запусков ещё не было.</Empty> : (
        <Panel title={`Последние · ${runs.length}`}>
          <ul className="divide-y divide-border">
            {runs.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => open(`run/${r.id}`)} className="w-full space-y-0.5 py-2 text-left text-sm">
                  <div className="flex items-center gap-2">
                    <span className={cn("sr-pill", !r.done ? "sr-pill-info" : r.code === 0 ? "sr-pill-success" : "sr-pill-danger")}>{!r.done ? "идёт" : r.code === 0 ? "готово" : `код ${r.code}`}</span>
                    <span className="font-medium">{r.action}</span>{r.only ? <span className="font-mono text-xs text-muted-foreground">{r.only}</span> : null}
                    <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">{r.started.slice(0, 16).replace("T", " ")}</span>
                  </div>
                  {r.tail.length ? <p className="truncate font-mono text-xs text-muted-foreground">{r.tail.at(-1)}</p> : null}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function LogView({ rpc, id }: { rpc: Rpc; id: string }) {
  const { data, error, reload } = useLoad<{ text: string }>(() => rpc.call("log", { id }), [rpc, id]);
  useEffect(() => { const t = setInterval(reload, 3000); return () => clearInterval(t); }, [reload]);
  if (error) return <p role="alert" className="text-sm text-destructive">{error}</p>;
  return (
    <div className="space-y-3">
      <div className="sr-strip"><h1 className="font-mono text-sm">{id}</h1></div>
      <pre className="sr-card max-h-[70vh] overflow-auto whitespace-pre-wrap p-3 font-mono text-xs">{data?.text.replace(/\r/g, "\n").replace(/\n{2,}/g, "\n") || "…"}</pre>
    </div>
  );
}

function Overview({ stories, open, newStory }: { stories: Story[]; open: (sub: string) => void; newStory: () => void }) {
  return (
    <div className="space-y-4">
      <div className="sr-strip space-y-2">
        <h1 className="text-xl font-medium">Сценарная</h1>
        <p className="text-sm text-muted-foreground">Истории, их сезоны, дела и книги. Слева выберите текст: в нём видны шапка, история правок, итоги проверки и обсуждения с агентом.</p>
        <Button size="sm" className="sr-accent" onClick={newStory}><Icon name="AiContentGenerator01" />Новая история</Button>
      </div>
      {stories.map((s) => {
        const all = s.seasons.flatMap((se) => [...se.cases, ...se.chapters]);
        const bad = all.filter((n) => n.findings > 0);
        return (
          <Panel key={s.id} title={<span className="flex items-center gap-2">{s.title} <Status s={s.status} /></span>} actions={s.canon ? <Button size="sm" variant="ghost" onClick={() => open(`canon/${s.id}`)}>Канон</Button> : undefined}>
            <p className="text-sm text-muted-foreground">
              {s.seasons.length ? `${s.seasons.length} сезона · ${all.length} текстов · проверено ${all.filter((n) => n.checked).length}${s.checkedAt ? ` (последняя проверка ${s.checkedAt.slice(0, 10)})` : ""}` : `${s.series.length} серий · ${s.films.length} роликов`}
            </p>
            {bad.length ? <ul className="mt-2 space-y-1">{bad.map((n) => <li key={n.file}><Row node={n} open={open} active="" /></li>)}</ul> : null}
          </Panel>
        );
      })}
    </div>
  );
}

// ——— the page ———

const TABS = [
  { id: "texts", label: "Тексты" },
  { id: "runs", label: "Запуски" },
  { id: "chats", label: "Чаты" },
] as const;

function StoryRoom({ subPath }: { subPath: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const compact = useIsCompactViewport();
  const open = useCallback((sub: string) => navigate.toPluginPanel(PATH, { subPath: sub }), [navigate]);
  const { data: stories, error, reload } = useLoad<Story[]>(() => rpc.call("tree", null), [rpc]);
  const { data: chatData, reload: reloadChats } = useLoad<{ chats: Chat[] }>(() => rpc.call("chats", {}), [rpc]);
  useRealtime("runs", reload);
  useRealtime("chats", reloadChats);
  const chats = chatData?.chats ?? [];
  const [kind, ...rest] = subPath.split("/");
  const tail = rest.join("/");
  const tab = kind === "runs" || kind === "run" ? "runs" : kind === "chats" ? "chats" : "texts";
  const newStory = async () => {
    try { const { threadId } = await rpc.call("chat", { task: "story" }); navigate.toThread(threadId); } catch (e) { toast.error(errorText(e)); }
  };
  const main = useMemo(() => {
    if (kind === "file" && tail) return <TextView key={tail} rpc={rpc} file={tail} open={open} chats={chats} />;
    if (kind === "brief" && rest.length === 2) return <BriefView rpc={rpc} story={rest[0]} at={rest[1]} />;
    if (kind === "canon" && tail) return <CanonView rpc={rpc} story={tail} />;
    if (kind === "runs") return <RunsView rpc={rpc} open={open} />;
    if (kind === "run" && tail) return <LogView rpc={rpc} id={tail} />;
    if (kind === "chats") return <div className="space-y-4"><div className="sr-strip"><h1 className="text-xl font-medium">Чаты «Сценарной»</h1></div><Panel title={`Все · ${chats.length}`}><ChatList chats={chats} /></Panel></div>;
    return stories ? <Overview stories={stories} open={open} newStory={newStory} /> : <Empty>Загружаю…</Empty>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subPath, stories, chats, rpc]);
  const tabs = (
    <div className="flex items-center gap-2 p-2">
      <div className="sr-seg flex-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} className="sr-seg-item flex-1 px-2 py-1 text-xs" onClick={() => open(t.id === "texts" ? "" : t.id)}>{t.label}</button>
        ))}
      </div>
      <Button size="icon" variant="ghost" className="size-7" aria-label="Обновить" onClick={() => { reload(); reloadChats(); }}><Icon name="ArrowReloadHorizontal" className="size-4" /></Button>
    </div>
  );
  const tree = error ? <p role="alert" className="p-2 text-sm text-destructive">{error}</p> : !stories ? <Empty>Загружаю…</Empty> : <Tree stories={stories} open={open} active={subPath} />;
  // A phone shows one screen at a time: the tree, or the chosen view with a way back.
  if (compact) {
    const back = kind === "run" ? "runs" : "";
    return (
      <div className="h-full min-h-0 flex-1 overflow-y-auto">
        {tabs}
        <div className="px-3 pb-6">
          {subPath === "" ? (
            <div className="space-y-3">
              <Button size="sm" className="sr-accent w-full" onClick={newStory}><Icon name="AiContentGenerator01" />Новая история</Button>
              {tree}
            </div>
          ) : (
            <div className="space-y-3">
              {kind !== "runs" && kind !== "chats" ? <Button size="sm" variant="ghost" className="-ml-2" onClick={() => open(back)}><Icon name="ArrowLeft" />Назад</Button> : null}
              {main}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border lg:w-80">
        {tabs}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">{tree}</div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto box-border w-full max-w-3xl px-4 pb-6 pt-3 md:px-5 md:pt-4">{main}</div>
      </main>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.settingsSection({ id: "models", title: "Модели агентов", description: "Какая модель из подписок BB играет какую роль.", component: ModelsSettings });
  app.slots.navPanel({ id: "story", title: "Сценарная", icon: "story-room/pen", path: PATH, component: StoryRoom });
});
