/**
 * BLUETORN CRM — Advisory Locking Mechanism
 *
 * Implements MariaDB/MySQL session-level advisory locks using GET_LOCK and RELEASE_LOCK.
 * Prevents concurrent migration executions from conflicting.
 *
 * Guarantees:
 * - Deterministic lock name per target database
 * - Bounded acquisition timeout
 * - Cleanup release in finally block
 */

/**
 * Generate deterministic lock name based on database name.
 *
 * @param {string} database Target database name
 * @returns {string} Safe lock identifier (max 64 chars)
 */
export function getLockIdentifier(database) {
  const sanitized = database.replace(/[^a-zA-Z0-9_]/g, "_");
  const lockName = `bluetorn_migrate_${sanitized}`;
  // MySQL GET_LOCK max length is 64 characters
  return lockName.slice(0, 64);
}

/**
 * Acquire MySQL/MariaDB advisory lock on the given connection.
 *
 * @param {Object} conn Active mysql2 connection
 * @param {string} database Target database name
 * @param {number} timeoutSeconds Timeout in seconds (default 10)
 * @returns {Promise<{ lockName: string, release: Function }>}
 */
export async function acquireAdvisoryLock(conn, database, timeoutSeconds = 10) {
  const lockName = getLockIdentifier(database);

  console.log(`🔒 Acquiring migration advisory lock '${lockName}' (timeout: ${timeoutSeconds}s)...`);

  const [rows] = await conn.query("SELECT GET_LOCK(?, ?) AS lock_status", [
    lockName,
    timeoutSeconds,
  ]);

  const lockStatus = rows?.[0]?.lock_status;

  if (lockStatus !== 1) {
    throw new Error(
      `[LOCK FAILURE] Unable to acquire advisory lock '${lockName}' after ${timeoutSeconds}s. ` +
        `Another migration process may be currently running against '${database}', ` +
        `or an earlier session did not release its lock. Lock status code: ${lockStatus}.`,
    );
  }

  console.log(`✅ Migration advisory lock '${lockName}' acquired successfully.`);

  let isReleased = false;

  const release = async () => {
    if (isReleased) return;
    try {
      const [relRows] = await conn.query("SELECT RELEASE_LOCK(?) AS release_status", [lockName]);
      const relStatus = relRows?.[0]?.release_status;
      isReleased = true;
      if (relStatus === 1) {
        console.log(`🔓 Advisory lock '${lockName}' released.`);
      } else {
        console.warn(`⚠️  Advisory lock '${lockName}' release returned status: ${relStatus}`);
      }
    } catch (err) {
      console.error(`⚠️  Error releasing advisory lock '${lockName}':`, err.message);
    }
  };

  return {
    lockName,
    release,
  };
}
