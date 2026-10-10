// In-memory stand-in for the Base44 SDK, used only by tests/functions.test.ts.
type Row = Record<string, any>;
const g = globalThis as any;
g.__store ??= new Map<string, Map<string, Row>>();
let seq = 0;

function table(name: string): Map<string, Row> {
  if (!g.__store.has(name)) g.__store.set(name, new Map());
  return g.__store.get(name);
}

function matches(row: Row, filter: Row): boolean {
  for (const [k, v] of Object.entries(filter)) {
    if (k === "$or") { if (!(v as Row[]).some((f) => matches(row, f))) return false; continue; }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if ("$exists" in v) { if ((row[k] !== undefined) !== v.$exists) return false; continue; }
      if ("$gt" in v) { if (!(row[k] > v.$gt)) return false; continue; }
    }
    if (row[k] !== v) return false;
  }
  return true;
}

function entityApi(name: string, ownerId: string | null) {
  const t = table(name);
  const clone = (r: Row) => structuredClone(r);
  return {
    async create(data: Row) {
      const id = `${name}_${++seq}`;
      const row = { ...structuredClone(data), id, created_by_id: ownerId };
      t.set(id, row);
      return clone(row);
    },
    async get(id: string) {
      const r = t.get(id);
      if (!r) throw new Error("not found");
      return clone(r);
    },
    async filter(f: Row = {}, opts: Row = {}) {
      const items = [...t.values()].filter((r) => matches(r, f)).map(clone);
      return { items: opts.limit ? items.slice(0, opts.limit) : items };
    },
    async updateMany(f: Row, upd: Row) {
      let updated = 0;
      for (const r of t.values()) if (matches(r, f)) { Object.assign(r, structuredClone(upd.$set)); updated++; }
      return { updated };
    },
  };
}

function client(userId: string | null) {
  const proxy = (owner: string | null) => new Proxy({}, { get: (_, n: string) => entityApi(n, owner) });
  return {
    auth: { me: async () => (userId ? { id: userId, email: `${userId}@test` } : null) },
    entities: proxy(userId),
    asServiceRole: { entities: proxy(userId) },
  };
}

export function createClientFromRequest(req: Request) {
  return client(req.headers.get("x-user"));
}
