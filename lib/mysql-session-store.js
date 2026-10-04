const { Store } = require("express-session");

// Preserve authenticated and guest room sessions across application restarts.
module.exports = class MysqlSessionStore extends Store {
  constructor(pool) {
    super();
    this.pool = pool;
    this.ready = null;
    this.lastCleanup = 0;
  }
  async table() {
    if (!this.ready)
      this.ready = this.pool
        .query(
          `CREATE TABLE IF NOT EXISTS PhienTruyCap (
      id VARCHAR(128) PRIMARY KEY, data MEDIUMTEXT NOT NULL, expires BIGINT NOT NULL,
      INDEX idx_session_expiry(expires)
    )`,
        )
        .catch((e) => {
          this.ready = null;
          throw e;
        });
    await this.ready;
  }
  get(id, cb) {
    this.table()
      .then(() =>
        this.pool.execute(
          "SELECT data FROM PhienTruyCap WHERE id=? AND expires>?",
          [id, Date.now()],
        ),
      )
      .then(([rows]) => cb(null, rows[0] ? JSON.parse(rows[0].data) : null))
      .catch(cb);
  }
  set(id, session, cb = () => {}) {
    this.table()
      .then(async () => {
        await this.pool.execute(
          "INSERT INTO PhienTruyCap(id,data,expires) VALUES(?,?,?) ON DUPLICATE KEY UPDATE data=VALUES(data),expires=VALUES(expires)",
          [id, JSON.stringify(session), this.expiry(session)],
        );
        if (Date.now() - this.lastCleanup > 3600000) {
          this.lastCleanup = Date.now();
          await this.pool.execute("DELETE FROM PhienTruyCap WHERE expires<?", [
            Date.now(),
          ]);
        }
      })
      .then(() => cb())
      .catch(cb);
  }
  touch(id, session, cb = () => {}) {
    this.table()
      .then(() =>
        this.pool.execute("UPDATE PhienTruyCap SET expires=? WHERE id=?", [
          this.expiry(session),
          id,
        ]),
      )
      .then(() => cb())
      .catch(cb);
  }
  destroy(id, cb = () => {}) {
    this.table()
      .then(() =>
        this.pool.execute("DELETE FROM PhienTruyCap WHERE id=?", [id]),
      )
      .then(() => cb())
      .catch(cb);
  }
  expiry(session) {
    return session.cookie?.expires
      ? new Date(session.cookie.expires).getTime()
      : Date.now() + 8 * 3600000;
  }
};
