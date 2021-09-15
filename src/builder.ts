export const f: Record<string, string> = new Proxy(
  {},
  { get: (_, name) => name }
);

export const sql = (_: TemplateStringsArray, ..._args: string[]): void => {};
