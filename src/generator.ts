import fs from "fs";
import ts from "typescript";
import { DatabaseError } from "pg-protocol";
import chokidar from "chokidar";
import { ClientConfig } from "pg";
import { connect, describeQuery, getPgTypes, listTablesAndColumns } from "./db";
import { red, green, explainQueryError, dedent } from "./utils";
import Mutex from "./mutex";
import * as types from "./types";
import { glob } from "glob";

interface Generator {
  db: types.Database;
  types: types.TypeMap;
  catalog: types.Catalog;
}

const visitAllNodes = (root: ts.Node, visitor: (n: ts.Node) => void): void => {
  const visit = (node: ts.Node): void => {
    visitor(node);
    node.forEachChild(visit);
  };
  visit(root);
};

export const extractQueriesFromAst = (ast: ts.SourceFile): string[] => {
  const r: string[] = [];

  visitAllNodes(ast, (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.escapedText === "query" &&
      node.arguments[0] &&
      ts.isNoSubstitutionTemplateLiteral(node.arguments[0])
    ) {
      r.push(node.arguments[0].text);
    }
  });

  return r;
};

const typemap: Record<string, string> = {
  // node-postgres also returns 64 bit ints (int8) as strings
  // would be nice to add the option to return these a ints
  int8: "string",
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
  bpchar: "string",
  timestamp: "Date",
  timestamptz: "Date",
};

type CodeBlock = string | Array<CodeBlock>;

const lines = (blocks: CodeBlock[], indent = ""): string => {
  return blocks
    .map((line) => {
      if (Array.isArray(line)) {
        return lines(line, "  " + indent);
      }
      return indent + line;
    })
    .join("\n");
};

const extractQueries = (filePath: string): types.QueryDefinition[] => {
  const code = fs.readFileSync(filePath, { encoding: "utf-8" });
  const ast = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest);
  const queries = extractQueriesFromAst(ast);

  return queries.map((sql): types.QueryDefinition => {
    const parameters = new Map<string, number>();

    const formatted = sql.replace(
      /(\$+)([\w_][\w\d_]*)/g,
      (match, prefix: string, name: string) => {
        if (prefix !== "$") {
          return match;
        }
        if (parameters.get(name) == null) {
          parameters.set(name, parameters.size + 1);
        }
        return "$" + parameters.get(name);
      }
    );

    return {
      formatted,
      original: sql,
      parameterNames: Array.from(parameters.keys()),
    };
  });
};

const pgTypeIdToTsType = (typeMap: types.TypeMap, typeId: number): string => {
  const type = typeMap[typeId];
  const tsTypeName =
    typemap[type?.name] ?? typemap[type?.name.replace(/\d/g, "")] ?? "unknown";

  if (tsTypeName === "unknown") {
    console.warn("unknown postgres type:", type);
  }

  return tsTypeName + (type.isArray ? "[]" : "");
};

const generateParametersType = (
  types: types.TypeMap,
  { input }: types.QueryDescription,
  { parameterNames }: types.QueryDefinition
): CodeBlock => {
  const uniq = Array.from(new Set(parameterNames)).sort();
  return [
    "{",
    uniq.map(
      (k) =>
        `${JSON.stringify(k)}: ${pgTypeIdToTsType(
          types,
          input[parameterNames.indexOf(k)]
        )} | null | undefined`
    ),
    "}",
  ];
};

const generateReturnType = (
  types: types.TypeMap,
  catalog: types.Catalog,
  desc: types.QueryDescription
): CodeBlock => {
  if (desc.output == null) {
    return ["void"];
  }

  return [
    "{",
    Array.from(desc.output)
      .sort((a, b) => (a.name < b.name ? -1 : 1))
      .map((x) => {
        let type = pgTypeIdToTsType(types, x.dataTypeID);
        const col = catalog.tables.get(x.tableID)?.columns.get(x.columnID);
        return `${JSON.stringify(x.name)}: ${type} ${
          col?.nullable ? "| null" : ""
        }`.trim();
      }),
    "}",
  ];
};

const processFile = async (
  gen: Generator,
  filepath: string
): Promise<types.ParsedQuery[]> => {
  return await Promise.all(
    extractQueries(filepath).map(async (definition) => {
      const description = await describeQuery(gen.db, definition.formatted);
      return { definition, description };
    })
  );
};

const generateModule = async (
  outputFile: string,
  gen: Generator,
  queryMap: Record<string, types.ParsedQuery[]>
) => {
  const flatParsedQueries = Object.entries(queryMap).flatMap(
    ([filename, queries]: [string, types.ParsedQuery[]]) => {
      return queries.map((query) => ({ filename, query }));
    }
  );

  for (const { filename, query } of flatParsedQueries) {
    console.log("\n>>", filename);
    if (query.description instanceof DatabaseError) {
      console.warn(red("Error: " + query.description.message));
      console.warn(
        dedent(
          explainQueryError(query.definition.formatted, query.description)
        ).trim()
      );
    } else {
      console.log(green(dedent(query.definition.original).trim()));
    }
  }

  const queryConst: CodeBlock = [
    `const Queries = {`,
    flatParsedQueries.map(({ filename, query }, i) => {
      // types for when the query has an error
      let inputType: CodeBlock = "never";
      let outputType: CodeBlock = "never";

      if (!(query.description instanceof DatabaseError)) {
        inputType = generateParametersType(
          gen.types,
          query.description,
          query.definition
        );

        outputType = generateReturnType(
          gen.types,
          gen.catalog,
          query.description
        );
      }

      return [
        `// ${filename}`,
        `${JSON.stringify(query.definition.original)}: new runtime.Query<`,
        [inputType, ",", outputType],
        `>(${JSON.stringify(query.definition.formatted)}, ${JSON.stringify(
          query.definition.parameterNames
        )}),`,
        "",
      ];
    }),
    "} as const",
  ];

  const code = lines([
    "import * as runtime from 'sqling/lib/runtime';",
    "",
    "/* THIS FILE IS AUTOMATICALLY GENERATED BY SQLING. DO NOT EDIT IT DIRECTLY */",
    "",
    ...queryConst,
    "",
    "export default function <T extends keyof typeof Queries>(sql: T): Readonly<typeof Queries[T]> {",
    "  return Queries[sql]",
    "}",
    "",
  ]);

  fs.writeFileSync(outputFile, code, { encoding: "utf-8" });
};

export const generate = async ({
  pattern,
  outputFile,
  pgConfig,
  watch = true,
  afterWrite = () => {},
}: {
  pattern: string | string[];
  outputFile: string;
  pgConfig: ClientConfig;
  watch: boolean;
  afterWrite?: () => void | Promise<void>;
}): Promise<void> => {
  const db = await connect(pgConfig);
  const generator = {
    db,
    types: await getPgTypes(db.client),
    catalog: await listTablesAndColumns(db.client),
  };

  const sources: Record<string, types.ParsedQuery[]> = {};

  for (const f of await glob(pattern)) {
    const queries = await processFile(generator, f);
    if (queries.length > 0) {
      sources[f] = queries;
    }
  }

  await generateModule(outputFile, generator, sources);
  await afterWrite();

  if (!watch) {
    db.client.end();
    db.conn.end();
    return;
  }

  const mutex = new Mutex();
  let ready = false;

  chokidar
    .watch(pattern, {})
    .on("ready", () => {
      ready = true;
    })
    .on("all", (event, f, _stats) => {
      if (ready) {
        processFile(generator, f).then((queries) => {
          if (queries.length === 0 && sources[f] == null) {
            return;
          }

          sources[f] = queries;
          mutex.synchronize(async () => {
            await generateModule(outputFile, generator, sources);
            await afterWrite();
          });
        });
      }
    });
};
