import { Client, Connection, FieldDef } from "pg";
import type Mutex from "./mutex";

export interface QueryDescription {
  input: number[];
  output: FieldDef[];
}

export interface PgType {
  name: string;
  isArray: boolean;
}

export interface TypeMap {
  [k: string]: PgType;
}

export interface Column {
  name: string
  nullable: boolean
}

export interface Table {
  schema: string
  name: string
  columns: Map<number, Column>
}

export interface Catalog {
  tables: Map<number, Table>
}

export interface Database {
  client: Client;
  conn: Connection;
  mutex: Mutex;
}

export interface QueryDef {
  sql: string;
  keys: string[];
}
