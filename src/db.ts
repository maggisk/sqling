import { Client, ClientConfig, Connection } from "pg";
import * as types from "./types";
import { sleep } from './utils'

export const connect = async (
  config?: ClientConfig
): Promise<types.Generator> => {
  const client = new Client(config);
  await client.connect();

  const { rows } = await client.query("SELECT * FROM pg_type");

  const idToRow: Record<string, any> = {};
  for (const row of rows) {
    idToRow[row.oid] = row;
  }

  const typeMap: types.TypeMap = {};
  for (const { oid, typelem, typcategory } of rows) {
    const isArray = typcategory === "A";
    const name = idToRow[isArray ? typelem : oid].typname;
    typeMap[oid] = { isArray, name };
  }

  // client.connection isn't exposed via typescript types
  const conn: Connection = (client as any).connection;

  // The Client and Connection from pg are extremely tightly coupled. If you
  // execute a query on Connection in stead of the Client it will cause errors.
  // Using only the Connection is difficult because there is a lot of initial
  // connection handling logic in the Client. So the simplest, although a little
  // hacky solution I've found is to use the Client to set up and prepare the
  // connection, and then call Connection.removeAllListeners, which disconnects
  // the Client and the Connection, and we can use the Connection as we want
  // without event liseteners in the Client causing issues when we do something
  // the Client doesn't expect
  conn.removeAllListeners();

  // (conn as any)._emitMessage = true;
  // conn.on("message", console.log);
  conn.on("errorMessage", console.error);
  return { conn, typeMap };
};

const locked = new Set();

export const describeQuery = async (
  conn: Connection,
  query: string
): Promise<types.QueryDescription> => {
  // TODO proper fix
  while (locked.has(conn)) {
    await sleep(10)
  }

  locked.add(conn);
  conn.sync()

  try {
    const promise = new Promise<types.QueryDescription>((resolve, reject) => {
      conn.on("errorMessage", err => {
        if (err.position) {
          // we need to subtract the length of the PREPARE sqling AS prefix
          err.position = parseInt(err.position, 10) - 18
        }
        reject(err);
      });
      conn.once("parameterDescription", ({ dataTypeIDs }) => {
        conn.once("rowDescription", ({ fields }) => {
          resolve({ input: dataTypeIDs, output: fields });
        });
      });
    });
    conn.query("DEALLOCATE ALL");
    conn.query(`PREPARE sqling AS ${query}`);
    conn.describe({ type: "S", name: "sqling" }, false);
    conn.flush();
    return await promise;
  } finally {
    locked.delete(conn);
    conn.removeAllListeners();
  }
};
