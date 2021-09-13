import { Connection as PgConn, FieldDef } from "pg";
import type Mutex from './mutex'

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

export interface Connection {
  conn: PgConn;
  mutex: Mutex;
}
