import { Pool } from "pg";
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
  public readonly args: Readonly<Array<keyof Params>>;
  public readonly defaults: { [P in keyof Params]?: Params[P] };

  constructor(
    sql: string,
    args: Array<keyof Params>,
    defaults: Partial<Params> = {}
  ) {
    this.sql = sql;
    this.args = Object.freeze(args.slice());
    this.defaults = defaults;
  }

  private arglist(params: Params): Array<any> {
    return this.args.map((k) => params[k]);
  }

  // because we don't know (yet) if fields come from left/right joins, they must
  // be marked manually as nullable for now when we want correct nullable types
  withNullable<K extends keyof Result>(
    keys: K[]
  ): Query<Params, Omit<Result, K> & { [P in K]: Result[P] | null }> {
    return new Query(this.sql, this.args.slice());
  }

  // setting default values for e.g. limit/offset parameters
  withDefaultParams<K extends keyof Params>(defaults: {
    [P in K]: Params[P];
  }): Query<Omit<Params, K> & Partial<Pick<Params, K>>, Result> {
    return new Query<any, any>(this.sql, this.args.slice(), {
      ...this.defaults,
      defaults,
    });
  }

  withReturnType<T extends Partial<Record<keyof Result, any>>>(): Query<
    Params,
    Omit<Result, keyof T> & T
  > {
    return new Query(this.sql, this.args.slice());
  }

  // execute query and return all results as an array
  async all(db: Pool, params: Params): Promise<Result[]> {
    const r = await db.query(this.sql, this.arglist(params));
    return r.rows;
  }

  // async generator that fetches results in bulks of `chuckSize` at a time
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

  // same as `chunks`, but yields each row at a time
  async *iterate(
    db: Pool,
    params: Params,
    options: { chunkSize?: number } = {}
  ): AsyncGenerator<Result> {
    for await (const chunk of this.chunks(db, params, options)) {
      for (const item of chunk) {
        yield item;
      }
    }
  }
}
