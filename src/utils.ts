import { DatabaseError } from "pg-protocol";

export const withColor = (color: string, text: string): string => {
  return `${color}${text}\x1b[0m`;
};

export const red = withColor.bind(null, "\x1b[31;1m");
export const green = withColor.bind(null, "\x1b[32;1m");
export const yellow = withColor.bind(null, "\x1b[33;1m");
export const blue = withColor.bind(null, "\x1b[34;1m");
export const clear = withColor.bind(null, "\x1b[0m");

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const explainQueryError = (
  query: string,
  error: DatabaseError
): string => {
  const pos = parseInt(error.position || "-1", 10);
  let chars = 0;

  const r = [];
  for (const line of query.split("\n")) {
    r.push(yellow(line));
    if (chars <= pos && pos <= chars + line.length) {
      const prefix = line.substring(0, pos - chars - 1).replace(/[^\t]/gu, " ");
      r.push(prefix + red("^"));
    }
    chars += line.length + 1;
  }

  return r.join("\n");
};
