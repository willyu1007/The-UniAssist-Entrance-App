/**
 * Lightweight YAML parsing utilities (dependency-free)
 *
 * Provides simple YAML parsing for common patterns used in registry files.
 * NOT a full YAML parser - only handles flat key-value pairs and simple lists.
 *
 * Usage:
 *   import { stripInlineComment, unquote, parseTopLevelVersion, parseListFieldValues } from './lib/yaml-lite.mjs';
 */

/**
 * Strip inline YAML comments (everything after # outside quotes).
 * @param {string} line - YAML line
 * @returns {string}
 */
export function stripInlineComment(line) {
  const s = String(line || '');
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    // Skip escaped characters inside quoted strings
    if (ch === '\\' && (inSingle || inDouble) && i + 1 < s.length) {
      i++; // skip the next character (escaped)
      continue;
    }
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      return s.slice(0, i);
    }
  }
  return s;
}

/**
 * Unquote a YAML value (removes surrounding single or double quotes).
 * @param {string} s - Quoted or unquoted value
 * @returns {string}
 */
export function unquote(s) {
  const t = String(s || '').trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Parse a top-level version field.
 * Looks for: version: <int>
 *
 * @param {string} raw - YAML content
 * @returns {number | null}
 */
export function parseTopLevelVersion(raw) {
  const m = raw.match(/^\s*version\s*:\s*([0-9]+)\s*$/m);
  return m ? Number(m[1]) : null;
}

/**
 * Parse values from list items with a specific key.
 * Looks for: - <listItemKey>: value
 *
 * @param {string} raw - YAML content
 * @param {string} listItemKey - Key to extract (e.g., 'provider_id')
 * @returns {string[]}
 */
export function parseListFieldValues(raw, listItemKey) {
  const values = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const re = new RegExp(`^\\s*\\-\\s*${listItemKey}\\s*:\\s*(.+)\\s*$`);

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const m = line.match(re);
    if (!m) continue;
    const v = unquote(m[1]);
    if (v) values.push(v);
  }

  return values;
}

/**
 * Parse scalar assignments across the document.
 * Looks for: keyName: value
 *
 * @param {string} raw - YAML content
 * @param {string} keyName - Key to extract
 * @returns {string[]}
 */
export function parseAllScalarValues(raw, keyName) {
  const values = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const re = new RegExp(`^\\s*${keyName}\\s*:\\s*(.+)\\s*$`);

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const m = line.match(re);
    if (!m) continue;
    const v = unquote(m[1]);
    if (v) values.push(v);
  }

  return values;
}

/**
 * Parse simple list items (- value).
 *
 * @param {string} raw - YAML content
 * @param {string} sectionKey - Section key to start parsing after (e.g., 'keys')
 * @returns {string[]}
 */
export function parseSimpleList(raw, sectionKey) {
  const values = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  let inSection = false;
  const sectionRe = new RegExp(`^${sectionKey}\\s*:\\s*$`);

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for section start
    if (sectionRe.test(trimmed)) {
      inSection = true;
      continue;
    }

    // Check for new section (key:)
    if (inSection && /^[a-z_]+\s*:\s*$/.test(trimmed)) {
      inSection = false;
      continue;
    }

    if (inSection) {
      const m = trimmed.match(/^\-\s*(.+)\s*$/);
      if (m) {
        const value = unquote(m[1]);
        if (value) values.push(value);
      }
    }
  }

  return values;
}

/**
 * Parse a simple key-value map from YAML content.
 * Only handles top-level flat key: value pairs.
 *
 * @param {string} raw - YAML content
 * @returns {Record<string, string>}
 */
export function parseSimpleMap(raw) {
  const result = {};
  const lines = raw.replace(/\r\n/g, '\n').split('\n');

  for (const originalLine of lines) {
    const line = stripInlineComment(originalLine).trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip list items
    if (trimmed.startsWith('-')) continue;

    const m = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)\s*$/);
    if (m) {
      const key = m[1];
      const value = unquote(m[2]);
      result[key] = value;
    }
  }

  return result;
}

/**
 * Check if a file header contains a template marker.
 * @param {string} raw - File content
 * @returns {boolean}
 */
export function hasTemplateHeader(raw) {
  const head = raw.split(/\r?\n/).slice(0, 5).join('\n');
  return head.toLowerCase().includes('(template)');
}
