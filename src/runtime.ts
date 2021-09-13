import { Pool, ClientBase } from "pg";
import { promisify } from "util";

// pg-cursor has no typescript support?
const Cursor = require("pg-cursor");

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [k: string]: Json };

export class Query<Params, Result> {
  public readonly sql: string;
  public readonly args: Array<keyof Params>;

  constructor(sql: string, args: Array<keyof Params>) {
    this.sql = sql;
    this.args = args;
  }

  private arglist(params: Params): Array<any> {
    return this.args.map(k => params[k]);
  }

  async all(db: ClientBase, params: Params): Promise<Result[]> {
    const r = await db.query(this.sql, this.arglist(params));
    return r.rows;
  }

  async first(db: ClientBase, params: Params): Promise<Result | null> {
    return (await this.all(db, params))[0] ?? null;
  }

  async *chunks(
    db: Pool,
    params: Params,
    { chunkSize = 100 }: { chunkSize?: number } = {}
  ): AsyncGenerator<Result[]> {
    const client = await db.connect();
    try {
      const cursor = client.query(new Cursor(this.sql, this.arglist(params)));
      const read = promisify(cursor.read).bind(cursor);
      while (true) {
        const results = await read(chunkSize);
        if (results.length > 0) {
          yield results;
        }
        if (results.length < chunkSize) {
          break;
        }
      }
    } finally {
      client.release();
    }
  }

  async *iterate(
    db: Pool,
    params: Params,
    options: { chunkSize?: number }
  ): AsyncGenerator<Result> {
    for await (const chunk of this.chunks(db, params, options)) {
      for (const item of chunk) {
        yield item;
      }
    }
  }
}
