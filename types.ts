// What `tools/story/room.ts` returns (the story repo owns the shape; the panel reads it).
export type Node = { file: string; title: string; status: string; updated: string; findings: number; checked: boolean };
export type Doc = { file: string; title: string };
export type Season = { id: string; title: string; status: string; file: string | null; findings: number; cases: Node[]; chapters: Node[]; plans: Doc[] };
export type Story = { id: string; title: string; status: string; canon: boolean; checkedAt: string | null; seasons: Season[]; series: { id: string; title: string; status: string; files: string[] }[]; films: Node[]; docs: Doc[] };

export type Finding = { unit: string; layer: string; kind: string; quote: string; canon?: string; why: string; fix?: string; verdict?: string };
export type History = { at: string; role: string; model?: string; note?: string };
export type Meta = {
  kind: string;
  story: string;
  season?: string;
  slot?: string;
  status: string;
  updated: string;
  canon?: { plants?: string[]; pays?: string[]; reveals?: string[] };
  checks?: Record<string, { ok: boolean; at: string; note?: string }>;
  history?: History[];
};
export type Text = {
  file: string;
  story: string;
  title: string;
  at: string | null;
  meta: Meta | null;
  body: string;
  units: string[];
  checks: { unit: string; at: string; findings: Finding[] }[];
  style: { path: string; score: number; flagged: { id: string; p: number; fix: string }[] }[];
};

export type Person = {
  id: string;
  name: string;
  roles: Record<string, string>;
  fate: { after: string; state: string; note?: string }[];
  attrs: { field: string; value: string; from: string; until?: string }[];
  knows: { since: string; what: string }[];
};
export type Canon = {
  story: string;
  order: string[];
  flashback: string[];
  people: Person[];
  facts: { id: string; text: string; since: string; source: string; keys?: string[] }[];
  threads: { id: string; planted: string; text: string; resolved: string; how: string }[];
  timeline: { when: string; event: string; source: string }[];
};

export type Run = { id: string; action: string; only: string | null; started: string; done: boolean; code: number | null; tail: string[] };
export type Chat = { id: string; title: string; status: string; file: string | null; task: string | null; createdAt: number };
