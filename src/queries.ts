export class QueryDef {
  public sql: string;
  public keys: string[];

  constructor(sql: string, keys: string[]) {
    this.sql = sql;
    this.keys = keys;
  }
}

export const f: Record<string, string> = new Proxy({}, {
  get: (_, name) => name
})

export const sql = (
  query: TemplateStringsArray,
  ...args: string[]
): QueryDef => {
  const s = query
    .flatMap((part, i) => (i ? ["$" + i, part] : [part]))
    .join("")
    .trim();

  return new QueryDef(s, args);
};
