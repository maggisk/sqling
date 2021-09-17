import { Client, ClientConfig, Connection } from "pg";
import * as types from "./types";
import Mutex from "./mutex";
import { DatabaseError } from "pg-protocol";

const newClient = async (config?: ClientConfig): Promise<Client> => {
  const client = new Client(config);
  await client.connect();
  return client;
};

const newConnection = async (config?: ClientConfig): Promise<Connection> => {
  const client = await newClient(config);

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
  return conn;
};

export const connect = async (
  config?: ClientConfig
): Promise<types.Database> => ({
  conn: await newConnection(config),
  client: await newClient(config),
  mutex: new Mutex()
});

export const getPgTypes = async (client: Client): Promise<types.TypeMap> => {
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

  return typeMap;
};

export const listTablesAndColumns = async (
  db: Client
): Promise<types.Catalog> => {
  const { rows } = await db.query(`
    SELECT *, table_name::regclass::oid as table_id
    FROM information_schema.columns
    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')`);

  const tables: types.Catalog["tables"] = new Map();
  for (const row of rows) {
    if (!tables.has(row.table_id)) {
      tables.set(row.table_id, {
        schema: row.table_schema,
        name: row.table_name,
        columns: new Map()
      });
    }
    tables.get(row.table_id)!.columns.set(row.ordinal_position, {
      name: row.column_name,
      nullable: row.is_nullable === "YES"
    });
  }

  return { tables };
};

const listenToResponseToDescribe = async (
  conn: Connection
): Promise<types.QueryDescription | DatabaseError> => {
  return new Promise(resolve => {
    conn.once("errorMessage", resolve);

    conn.once("parameterDescription", ({ dataTypeIDs }) => {
      conn.once("rowDescription", ({ fields }) => {
        resolve({ input: dataTypeIDs, output: fields });
      });
    });
  });
};

export const describeQuery = async (
  { conn, mutex }: types.Database,
  query: string
): Promise<types.QueryDescription | DatabaseError> => {
  return mutex.synchronize(async () => {
    conn.removeAllListeners();
    conn.sync();

    conn.parse({ text: query, name: "sqling", types: [] }, false);
    conn.describe({ type: "S", name: "sqling" }, false);
    conn.query("deallocate sqling");
    conn.flush();

    return await listenToResponseToDescribe(conn);
  });
};
