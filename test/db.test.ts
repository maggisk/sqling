import assert from "assert";
import test from "japa";
import { DatabaseError } from "pg";
import { describeQuery } from "../src/db";
import * as utils from "./utils";

test.group("db.describeQuery", () => {
  test("describe constants", async t => {
    const conn = await utils.conn;
    const desc = await describeQuery(conn, "select 1 as n, '' as s");
    assert(!(desc instanceof DatabaseError));
    t.equal(desc.input.length, 0);
    t.equal(desc.output[0].name, "n");
    t.equal(desc.output[1].name, "s");
    t.equal(desc.output[0].tableID, 0);
    t.equal(desc.output[1].tableID, 0);
  });

  test("decribe table", async t => {
    const conn = await utils.conn;
    const desc = await describeQuery(conn, "select * from all_types");
    assert(!(desc instanceof DatabaseError));
    t.isAtLeast(desc.output.length, 1);
    for (const column of desc.output) {
      t.isAtLeast(column.tableID, 1);
      t.isAtLeast(column.columnID, 1);
    }
  });

  test("describe params", async t => {
    const conn = await utils.conn;
    const desc = await describeQuery(conn, "select 1 from all_types where id = $1");
    console.log(desc)
    assert(!(desc instanceof DatabaseError));
  });
});
