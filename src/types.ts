import type { Client, Connection, DatabaseError, FieldDef } from "pg";
import type Mutex from "./mutex";

export interface QueryDescription {
  input: number[];
  output: FieldDef[] | null;
}

export interface PgType {
  name: string;
  isArray: boolean;
}

export type TypeMap = Record<string, PgType>;

export interface Column {
  name: string;
  nullable: boolean;
}

export interface Table {
  schema: string;
  name: string;
  columns: Map<number, Column>;
}

export interface Catalog {
  tables: Map<number, Table>;
}

export interface Database {
  client: Client;
  conn: Connection;
  mutex: Mutex;
}

export interface QueryDefinition {
  original: string;
  formatted: string;
  parameterNames: string[];
}

export type DescriptionResult = QueryDescription | DatabaseError;

export interface ParsedQuery {
  definition: QueryDefinition;
  description: DescriptionResult;
}
