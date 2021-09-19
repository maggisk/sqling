import * as utils from './utils'

export const teardown = async () => {
  const { conn, client } = await utils.conn
  client.end()
  conn.end()
}
