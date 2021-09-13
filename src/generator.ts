import assert from "assert";
import fs from "fs";
import { join } from "path";
import chokidar from "chokidar";
import { ClientConfig } from "pg";
import { connect, describeQuery } from "./db";
import { QueryDescription, Generator, TypeMap } from "./types";
import { QueryDef } from "./queries";

const typemap: Record<string, string> = {
  int8: "string", // node-postgres also returns 64 bit ints as strings
  int: "number",
  float: "number",
  numeric: "number",
  bool: "boolean",
  json: "runtime.Json",
  jsonb: "runtime.Json",
  text: "string",
  char: "string",
  varchar: "string",
  uuid: "string",
  timestamp: "Date",
  timestamptz: "Date"
};

const collectQueries = (filePath: string): Array<[string, QueryDef]> => {
  const path = require.resolve(join(process.cwd(), filePath));
  delete require.cache[path];
  const mod: Record<string, QueryDef> = require(path);
  return Object.entries(mod).filter(([, query]) => {
    return query instanceof QueryDef;
  });
};

const pgTypeIdToTsType = (typeMap: TypeMap, typeId: number): string => {
  const type = typeMap[typeId];
  const tsTypeName =
    typemap[type.name] ?? typemap[type.name.replace(/\d/g, "")] ?? "unknown";

  if (tsTypeName === 'unknown') console.log(type)
  return tsTypeName + (type.isArray ? "[]" : "");
};

const generateInputType = (
  typeMap: TypeMap,
  desc: QueryDescription,
  query: QueryDef
): string[] => {
  return Array.from(new Set(query.keys)).map((k, i) => {
    return `${k}: ${pgTypeIdToTsType(typeMap, desc.input[i])}`;
  });
};

const generateReturnType = (
  typeMap: TypeMap,
  desc: QueryDescription
): string[] => {
  return desc.output.map(field => {
    return `${field.name}: ${pgTypeIdToTsType(typeMap, field.dataTypeID)}`;
  });
};

const generateQuery = async (
  name: string,
  query: QueryDef,
  { typeMap, conn }: Generator
) => {
  const id = name.charAt(0).toUpperCase() + name.substring(1);
  const description = await describeQuery(conn, query.sql);

  return `
export interface ${id}Input {
  ${generateInputType(typeMap, description, query).join("\n  ")}
}

export interface ${id}Output {
  ${generateReturnType(typeMap, description).join("\n  ")}
}

export const ${name} = new runtime.Query<${id}Input, ${id}Output>(
  ${JSON.stringify(query.sql)},
  ${query.keys.length ? JSON.stringify(query.keys) : 'undefined'}
)`;
};

const writeFile = async (
  session: Generator,
  sourceFile: string
): Promise<void> => {
  const queries = collectQueries(sourceFile);
  const queryCode = [];
  for (const [name, query] of queries) {
    queryCode.push(await generateQuery(name, query, session));
  }

  const code = [
    "import * as runtime from 'sqling/lib/runtime'",
    "/* THIS FILE IS AUTOMATICALLY GENERATED BY SQLING. DO NOT EDIT IT DIRECTLY */",
    ...queryCode
  ].join("\n\n");

  const destFile = sourceFile.replace(".sql.ts", ".ts");
  assert(destFile !== sourceFile, "attempted to overwrite input file");
  fs.writeFileSync(destFile, code, { encoding: "utf8" });
  console.log("generated", destFile);
};

export const generate = async ({
  glob,
  pgConfig,
  afterWrite = () => {}
}: {
  glob: string | string[];
  pgConfig: ClientConfig;
  afterWrite?: (path: string) => void | Promise<void>;
}): Promise<void> => {
  const conn = await connect(pgConfig);

  chokidar.watch(glob).on("all", (_event, path, _stats) => {
    if (!path.endsWith(".sql.ts")) {
      console.warn("unexpected input file: " + path);
      console.warn("sqling will only process files ending in .sql.ts");
      console.warn("change your glob pattern to only match those files");
      return;
    }

    writeFile(conn, path).catch(console.error);
    const after = afterWrite(path);
    if (after && 'catch' in after) {
      after.catch(console.error)
    }
  });
};