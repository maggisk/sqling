# SqLing

Validate your postgres queries at compile time and generate typescript types for parameters and return values

### Why?

Postgres is nice. Types are nice. Sql isn't so bad either

It improves your confidence in your code alot to validate all your queries at compile time and have types for everything interacting with the database to avoid mistakes.

### How?

`yarn add sqling` or `npm install sqling` (TODO: not actually published to npm yet :)

create a `sqling.js` file in your project containing the following

```
const sqling = require("sqling");

sqling.generate({
  glob: "src/**/*.ts",
  pgConfig: {
    host: "localhost",
    password: "postgres",
    user: "postgres",
    database: "your-db"
  }
});
```

and run it with `node sqling.js`. This will create a watcher that creates a
corresponding `.ts` file every time your `.sql.ts` changes

now write your queries in the `src` directory e.g. `users.ts`

```
import { sql, f } from 'sqling'

export const paginateUsers = sql`
SELECT * FROM users
LIMIT ${f.limit}
OFFSET ${f.offset}
`
```

now you can import `src/users.sql` and run the query with something like

```
import { Pool } from 'pg'
import { paginateUsers } from './users.sql'
// ...
const db = new Pool()
const users = await paginateUsers.all(db, { offset: 0, limit: 10 })
```

### Status

Early alpha. Proof of concept and barely usable :)

### TODOs

Roughly in order

- [x] fix error handling when there is an error in query
- [ ] fix types to allow null for optional paremeter values and return values
- [ ] improve tests
- [ ] publish to npm
- [ ] decide how to deal with 64 bit integers sent to/from postgres (strings at the moment which is annoying)
- [ ] support for inserting multiple rows in a single query
- [ ] support for more builtin postgresql types
- [ ] more flexibility in where generated files are stored
- [ ] `sqlFragment` function for re-usable where conditions etc.
- [ ] support for custom field types with encode/decode transformers?
- [ ] autogenerated CRUD functions


## Inspiration

[yesql](https://github.com/krisajenkins/yesql), [pugsql](https://pugsql.org/), [sqlc](https://github.com/kyleconroy/sqlc) and more.

Props to [pg-typed](https://github.com/adelsz/pgtyped) which is a similar library for postgres and typescript but I found some features missing, like support for query fragments, `ANY`, cursors and better types. I attempted to add those features myself but the codebase was huge and complex (and a little scary), so I decided to make my own minimal implementation.
