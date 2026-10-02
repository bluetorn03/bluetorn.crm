/**
 * BLUETORN CRM — Destructive Migration Safety Analyzer
 *
 * Inspects SQL statements in migration files to detect potentially destructive
 * operations that could cause data loss:
 * - DROP TABLE
 * - DROP COLUMN / ALTER TABLE ... DROP
 * - TRUNCATE TABLE
 * - DELETE without WHERE
 * - UPDATE without WHERE
 *
 * Enforces production safety policies:
 * - Never automatically execute destructive SQL in production.
 * - In production: require ALLOW_DESTRUCTIVE_PRODUCTION_MIGRATIONS=true
 * - In local: log prominent warnings detailing the statements found.
 */

/**
 * Remove SQL comments to avoid false positives in comments.
 *
 * @param {string} sql Raw SQL text
 * @returns {string} SQL without comments
 */
export function stripComments(sql) {
  // Strip block comments /* ... */
  let stripped = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  // Strip single-line comments -- ... and # ...
  stripped = stripped.replace(/--.*$/gm, "");
  stripped = stripped.replace(/^#.*$/gm, "");
  return stripped;
}

/**
 * Detect potentially destructive operations in a given SQL script.
 *
 * @param {string} sqlContent Normalized SQL content
 * @returns {Array<{ type: string, description: string, snippet: string }>}
 */
export function detectDestructiveOperations(sqlContent) {
  const cleanSql = stripComments(sqlContent);
  const detected = [];

  // 1. DROP TABLE
  const dropTableRegex = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`\w.]+)/gi;
  let match;
  while ((match = dropTableRegex.exec(cleanSql)) !== null) {
    detected.push({
      type: "DROP_TABLE",
      description: `Drops table '${match[1]}'`,
      snippet: match[0].slice(0, 100),
    });
  }

  // 2. DROP DATABASE
  const dropDbRegex = /\bDROP\s+DATABASE\s+(?:IF\s+EXISTS\s+)?([`\w.]+)/gi;
  while ((match = dropDbRegex.exec(cleanSql)) !== null) {
    detected.push({
      type: "DROP_DATABASE",
      description: `Drops database '${match[1]}'`,
      snippet: match[0].slice(0, 100),
    });
  }

  // 3. DROP COLUMN
  const dropColRegex = /\bALTER\s+TABLE\s+[`\w.]+\s+DROP\s+(?:COLUMN\s+)?([`\w]+)/gi;
  while ((match = dropColRegex.exec(cleanSql)) !== null) {
    detected.push({
      type: "DROP_COLUMN",
      description: `Drops column '${match[1]}'`,
      snippet: match[0].slice(0, 100),
    });
  }

  // 4. TRUNCATE TABLE
  const truncateRegex = /\bTRUNCATE(?:\s+TABLE)?\s+([`\w.]+)/gi;
  while ((match = truncateRegex.exec(cleanSql)) !== null) {
    detected.push({
      type: "TRUNCATE_TABLE",
      description: `Truncates table '${match[1]}'`,
      snippet: match[0].slice(0, 100),
    });
  }

  // 5. DELETE without WHERE clause
  // Split statements by semicolon to evaluate each DELETE / UPDATE individually
  const statements = cleanSql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const stmt of statements) {
    if (/^\s*DELETE\s+FROM\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt)) {
      detected.push({
        type: "UNRESTRICTED_DELETE",
        description: "DELETE statement executed without a WHERE clause",
        snippet: stmt.slice(0, 100),
      });
    }

    if (/^\s*UPDATE\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt)) {
      detected.push({
        type: "UNRESTRICTED_UPDATE",
        description: "UPDATE statement executed without a WHERE clause",
        snippet: stmt.slice(0, 100),
      });
    }
  }

  return detected;
}

/**
 * Validate destructive safety across a set of pending migrations.
 *
 * @param {Array<Object>} migrations List of migration objects
 * @param {boolean} isProduction Whether target is production
 * @param {boolean} allowDestructiveProduction Whether explicit destructive flag is set
 */
export function validateDestructiveSafety(migrations, isProduction, allowDestructiveProduction) {
  const violations = [];

  for (const m of migrations) {
    const ops = detectDestructiveOperations(m.content);
    if (ops.length > 0) {
      if (isProduction && !allowDestructiveProduction) {
        violations.push({
          migration: m.filename,
          operations: ops,
        });
      } else {
        console.warn(`\n⚠️  [DESTRUCTIVE OPERATION WARNING] in ${m.filename}:`);
        for (const op of ops) {
          console.warn(`   - [${op.type}] ${op.description}: "${op.snippet}"`);
        }
        if (isProduction && allowDestructiveProduction) {
          console.warn(`   [AUTHORIZED VIA ALLOW_DESTRUCTIVE_PRODUCTION_MIGRATIONS=true]`);
        }
      }
    }
  }

  if (violations.length > 0) {
    const msg = violations
      .map(
        (v) =>
          `Migration ${v.migration} contains ${v.operations.length} destructive operation(s): ` +
          v.operations.map((o) => `[${o.type}] ${o.description}`).join(", "),
      )
      .join("\n");

    throw new Error(
      `[PRODUCTION SAFETY VIOLATION] Destructive SQL detected in production target!\n${msg}\n` +
        `Executing destructive DDL/DML in production is strictly blocked by default.\n` +
        `If this change was explicitly reviewed and approved, set ALLOW_DESTRUCTIVE_PRODUCTION_MIGRATIONS=true.`,
    );
  }
}
