import { DatabaseError } from "pg-protocol";

export const color = (color: string, text: string): string => {
  return `${color}${text}\x1b[0m`;
};

export const red = color.bind(null, "\x1b[31;1m");
export const green = color.bind(null, "\x1b[32;1m");
export const yellow = color.bind(null, "\x1b[33;1m");
export const blue = color.bind(null, "\x1b[34;1m");

export const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const dedent = (sql: string): string => {
  let min = Infinity;
  for (const line of sql.split("\n")) {
    if (line.trim() !== "") {
      min = Math.min(min, line.match(/^ */)![0].length);
    }
  }

  if (min === Infinity) {
    return sql;
  }

  return sql
    .split("\n")
    .map((line) => line.substring(min))
    .join("\n");
};

export const explainQueryError = (
  query: string,
  error: DatabaseError
): string => {
  const pos = parseInt(error.position || "-1", 10);
  let chars = 0;

  const r = [];
  for (const line of query.split("\n")) {
    // don't wrap indentatin with colors for the output to play nice with dedent
    if (line.trim() === "") {
      r.push(line);
    } else {
      const indent = line.match(/^ */)![0];
      r.push(indent + yellow(line.substring(indent.length)));
    }

    if (chars <= pos && pos <= chars + line.length) {
      const prefix = line.substring(0, pos - chars - 1).replace(/[^\t]/gu, " ");
      r.push(prefix + red("^"));
    }
    chars += line.length + 1;
  }

  return r.join("\n");
};
