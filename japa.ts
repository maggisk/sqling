import * as japa from "japa";
import { setup } from "./test/setup";
import { teardown } from "./test/teardown";

japa.configure({
  files: ["test/**/*.test.ts"],
  before: [setup],
  after: [teardown]
});
