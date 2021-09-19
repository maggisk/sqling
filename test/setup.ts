import { generate } from "../src/generator";
import * as utils from './utils'

export const setup = async () => {
  const { client } = await utils.conn;

  // https://www.postgresql.org/docs/current/datatype.html#DATATYPE-TABLE
  await client.query(`
    drop table if exists all_types cascade;
    drop table if exists mixed cascade;

    create table all_types (
      id serial primary key,

      required_bigint bigint not null,
      nullable_bigint bigint,

      required_bit bit(8) not null,
      nullable_bit bit(8),

      required_bitvar bit varying (8) not null,
      nullable_bitvar bit varying (8),

      required_boolean boolean not null,
      nullable_boolean boolean,

      required_box box not null,
      nullable_box box,

      required_bytea bytea not null,
      nullable_bytea bytea,

      required_char char(10) not null,
      nullable_char char(10),

      required_varchar varchar not null,
      nullable_varchar varchar,

      required_cidr cidr not null,
      nullable_cidr cidr,

      required_date date not null,
      nullable_date date,

      required_int int not null,
      nullable_int int,

      required_text text not null,
      nullable_text text
    );
  `);

  await generate({
    glob: "test/**/*.test.ts",
    watch: false,
    pgConfig: {}
  });
};
