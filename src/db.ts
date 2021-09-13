import { Client, ClientConfig, Connection } from "pg";
import * as types from "./types";
import Mutex from "./mutex";
import { DatabaseError } from "pg-protocol";

export const connect = async (
  config?: ClientConfig
): Promise<types.Connection> => {
  const client = new Client(config);
  await client.connect();

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
  return { conn, mutex: new Mutex() };
};

export const getPgTypes = async (
  config?: ClientConfig
): Promise<types.TypeMap> => {
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

  await client.end();
  return typeMap;
};

const PREPARE_STATEMENT = "PREPARE sqling AS ";

const listenToResponseToDescribe = async (
  conn: Connection
): Promise<types.QueryDescription | DatabaseError> => {
  return new Promise<types.QueryDescription>(resolve => {
    conn.once("errorMessage", error => {
      if (error.position) {
        // we need to subtract the length of the "PREPARE AS" statement to get
        // correct query error position
        error.position = (
          parseInt(error.position, 10) - PREPARE_STATEMENT.length
        ).toString();
      }
      resolve(error);
    });
    conn.once("parameterDescription", ({ dataTypeIDs }) => {
      conn.once("rowDescription", ({ fields }) => {
        resolve({ input: dataTypeIDs, output: fields });
      });
    });
  });
};

export const describeQuery = async (
  { conn, mutex }: types.Connection,
  query: string
): Promise<
  types.QueryDescription | DatabaseError
> => {
  return mutex.synchronize(async () => {
    conn.removeAllListeners();
    conn.sync();

    conn.query("DEALLOCATE ALL");
    conn.query(`${PREPARE_STATEMENT}${query}`);
    conn.describe({ type: "S", name: "sqling" }, false);
    conn.flush();

    return await listenToResponseToDescribe(conn);
  });
};
