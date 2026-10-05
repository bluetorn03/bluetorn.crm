/**
 * BLUETORN CRM — MySQL connection layer.
 *
 * Server-side only. Uses lazy async import of mysql2/promise to prevent
 * accidental client bundling by Vite / TanStack Start.
 * Reads DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD from process.env.
 *
 * NEVER import this file in client-side components.
 */
import type { RowDataPacket, ResultSetHeader, Pool, PoolConnection } from "mysql2/promise";

/* ----------------------------- connection pool ----------------------------- */

let _pool: Pool | undefined;

async function getPool(): Promise<Pool> {
  if (_pool) return _pool;

  const mysqlModule = await import("mysql2/promise");
  const createPool = mysqlModule.createPool || (mysqlModule as any).default?.createPool;

  const config = {
    host: process.env["DB_HOST"] || "localhost",
    port: Number(process.env["DB_PORT"]) || 3306,
    database: process.env["DB_NAME"] || "bluetorn_crm",
    user: process.env["DB_USER"] || "root",
    password: process.env["DB_PASSWORD"] ?? "",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: "utf8mb4",
    timezone: "+00:00",
    decimalNumbers: true,
  };

  _pool = createPool(config);
  _pool.on("connection", (conn: any) => {
    conn.query("SET time_zone = '+00:00'");
  });
  return _pool;
}

/* --------------------------------- helpers -------------------------------- */

/** Run a SELECT and return typed rows. */
export async function query<T = RowDataPacket>(sql: string, params?: any[]): Promise<T[]> {
  const pool = await getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(sql, params ?? []);
  return rows as T[];
}

/** Run a SELECT and return the first row or null. */
export async function queryOne<T = RowDataPacket>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Run an INSERT / UPDATE / DELETE and return the result header. */
export async function execute(sql: string, params?: any[]): Promise<ResultSetHeader> {
  const pool = await getPool();
  const [result] = await pool.execute<ResultSetHeader>(sql, params ?? []);
  return result;
}

/** Run multiple statements inside a transaction. */
export async function transaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/* ----------------------------------- uuid --------------------------------- */

/** Generate a UUID v4 — crypto.randomUUID is available in Node 19+ and all modern runtimes. */
export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older runtimes
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
