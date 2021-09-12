import { Connection, FieldDef } from "pg";

export interface QueryDescription {
  input: number[];
  output: FieldDef[];
}

export interface PgType {
  name: string;
  isArray: boolean;
}

export interface TypeMap {
  [k: string]: PgType
}

export interface Generator {
  conn: Connection;
  typeMap: TypeMap
}
