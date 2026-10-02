/**
 * BLUETORN CRM — Migration File Integrity & Checksum Engine
 *
 * Implements deterministic SHA-256 calculation across Windows & Linux:
 * - Strip UTF-8 BOM if present
 * - Normalize CRLF to LF
 * - Preserves exact character content
 *
 * Strictly enforces filename conventions:
 * - Pattern: NNN_descriptive_name.sql (3+ digits)
 * - Rejects malformed filenames, duplicate versions, gaps in sequence
 * - Monotonically ordered by numeric version
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const FILENAME_PATTERN = /^(\d{3,})_([a-zA-Z0-9_-]+)\.sql$/;

/**
 * Deterministically normalize content and compute SHA-256 hash.
 *
 * @param {string} content Raw file content
 * @returns {string} 64-character hex hash
 */
export function calculateChecksum(content) {
  if (typeof content !== "string") {
    throw new TypeError("Migration content must be a string");
  }
  let normalized = content;
  // Strip UTF-8 BOM if present
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }
  // Normalize CRLF to LF
  normalized = normalized.replace(/\r\n/g, "\n");

  return crypto.createHash("sha256").update(normalized, "utf-8").digest("hex");
}

/**
 * Read a migration file and compute its SHA-256 checksum.
 *
 * @param {string} filePath Absolute or relative path to migration file
 * @returns {{ checksum: string, content: string }}
 */
export function readMigrationFileWithChecksum(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Migration file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const checksum = calculateChecksum(raw);
  // Also normalize content returned so executed statements are standard LF
  let normalizedContent = raw;
  if (normalizedContent.charCodeAt(0) === 0xfeff) {
    normalizedContent = normalizedContent.slice(1);
  }
  normalizedContent = normalizedContent.replace(/\r\n/g, "\n");

  return {
    checksum,
    content: normalizedContent,
    raw,
  };
}

/**
 * Parse and validate a migration filename.
 *
 * @param {string} filename Base filename (e.g. 001_finance_v1.sql)
 * @returns {{ version: string, name: string, numericVersion: number, filename: string }}
 */
export function parseMigrationFilename(filename) {
  const match = FILENAME_PATTERN.exec(filename);
  if (!match) {
    throw new Error(
      `Malformed migration filename: '${filename}'. ` +
        `Migration filenames must follow the pattern: NNN_descriptive_name.sql (e.g. 005_feature_name.sql)`,
    );
  }
  const [, versionStr, descriptiveName] = match;
  const numericVersion = parseInt(versionStr, 10);
  return {
    version: versionStr,
    name: descriptiveName,
    numericVersion,
    filename,
  };
}

/**
 * Discover, parse, and validate all migration files in the given directory.
 *
 * Checks:
 * 1. Directory exists
 * 2. All files adhere to NNN_descriptive_name.sql
 * 3. No duplicate version numbers
 * 4. Contiguous sequence without gaps starting at 1
 * 5. Deterministic SHA-256 computed for each file
 *
 * @param {string} migrationsDir Path to migrations directory
 * @returns {Array<Object>} Sorted list of valid migration objects
 */
export function discoverMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
  }

  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const sqlFiles = entries.filter((e) => e.isFile());

  if (sqlFiles.length === 0) {
    throw new Error(`No migration files found in directory: ${migrationsDir}`);
  }

  // Parse and validate each filename
  const parsedMigrations = [];
  for (const entry of sqlFiles) {
    const filename = entry.name;
    // Check if non-sql or malformed
    const parsed = parseMigrationFilename(filename);
    const fullPath = path.join(migrationsDir, filename);
    const { checksum, content } = readMigrationFileWithChecksum(fullPath);

    parsedMigrations.push({
      ...parsed,
      filePath: fullPath,
      checksum,
      content,
    });
  }

  // Check for duplicate versions (by numeric value and by string)
  const seenNumeric = new Map();
  const seenString = new Map();
  for (const m of parsedMigrations) {
    if (seenNumeric.has(m.numericVersion)) {
      throw new Error(
        `Duplicate migration version detected: version ${m.version} in '${m.filename}' ` +
          `conflicts with '${seenNumeric.get(m.numericVersion)}'`,
      );
    }
    if (seenString.has(m.version)) {
      throw new Error(
        `Duplicate migration version string detected: '${m.version}' in '${m.filename}' ` +
          `conflicts with '${seenString.get(m.version)}'`,
      );
    }
    seenNumeric.set(m.numericVersion, m.filename);
    seenString.set(m.version, m.filename);
  }

  // Sort strictly by numericVersion ascending
  parsedMigrations.sort((a, b) => a.numericVersion - b.numericVersion);

  // Validate contiguous sequence starting at 1
  for (let i = 0; i < parsedMigrations.length; i++) {
    const expectedNum = i + 1;
    const actual = parsedMigrations[i];
    if (actual.numericVersion !== expectedNum) {
      const expectedFormatted = String(expectedNum).padStart(3, "0");
      throw new Error(
        `Missing migration sequence gap: expected version ${expectedFormatted} at sequence position ${i + 1}, ` +
          `but found version ${actual.version} ('${actual.filename}'). ` +
          `Migration numbers must form an unbroken contiguous sequence.`,
      );
    }
  }

  return parsedMigrations;
}
