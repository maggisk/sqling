import test from "japa";
import { connect, describeQuery } from "../src/db";

test("describeQuery", async () => {
  const { conn } = await connect();
  await describeQuery(conn, "select 1 as n");
  await describeQuery(conn, "select * from test");
  await describeQuery(conn, "SELECT * FROM test where id = $1 or id = $2");
  await describeQuery(conn, "insert into test values (1, 'a'");
});
