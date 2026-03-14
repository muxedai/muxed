/**
 * Field filtering for tool call responses.
 * Supports dot-notation paths with array bracket syntax.
 * Only applies to JSON-parseable outputs — non-JSON content is returned unchanged.
 *
 * Examples:
 *   "rows[].name"    → extract `name` from each element of `rows`
 *   "content[].text"  → extract `text` from each content block
 *   "data.id"         → extract `data.id`
 */

/** Parse a field path like "rows[].name" into segments. */
function parsePath(path: string): Array<{ key: string; isArray: boolean }> {
  const segments: Array<{ key: string; isArray: boolean }> = [];

  for (const part of path.split('.')) {
    if (part.endsWith('[]')) {
      segments.push({ key: part.slice(0, -2), isArray: true });
    } else {
      segments.push({ key: part, isArray: false });
    }
  }

  return segments;
}

function extractDeep(obj: unknown, segments: Array<{ key: string; isArray: boolean }>): unknown {
  if (segments.length === 0 || obj == null || typeof obj !== 'object') return obj;

  const [first, ...rest] = segments;
  if (!first) return obj;

  const value = (obj as Record<string, unknown>)[first.key];

  if (first.isArray) {
    if (!Array.isArray(value)) return undefined;
    if (rest.length === 0) return value;
    return value.map((item) => extractDeep(item, rest)).filter((v) => v !== undefined);
  }

  if (rest.length === 0) return value;
  return extractDeep(value, rest);
}

/** Extract a value from an object following a parsed path. */
function extract(obj: unknown, path: string): unknown {
  const segments = parsePath(path);
  return extractDeep(obj, segments);
}

/** Set a value in a nested object, creating intermediate objects as needed. */
function setNested(obj: Record<string, unknown>, keys: string[], value: unknown): void {
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}

/** Try to extract fields from a plain object. Returns null if no fields matched. */
function extractFromObject(
  data: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> | null {
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    const value = extract(data, field);
    if (value !== undefined) {
      setNested(result, field.replace(/\[\]/g, '').split('.'), value);
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/** Check if a string is valid JSON (object or array). */
function isJsonString(str: string): boolean {
  const trimmed = str.trim();
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

/**
 * Filter a tool call response to include only the specified field paths.
 *
 * Only applies filtering when the response contains JSON-parseable data:
 * - `structuredContent` (always an object)
 * - Text content blocks whose text is valid JSON
 *
 * Non-JSON text content, images, audio, and other block types are returned unchanged.
 */
export function filterFields(
  data: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  // 1. Try structuredContent first (always JSON-parseable by definition)
  if (data.structuredContent && typeof data.structuredContent === 'object') {
    const filtered = extractFromObject(data.structuredContent as Record<string, unknown>, fields);
    if (filtered) {
      return { ...data, structuredContent: filtered };
    }
  }

  // 2. Try text content blocks that contain valid JSON
  const content = data.content as Array<{ type: string; text?: string }> | undefined;
  if (Array.isArray(content)) {
    const newContent = content.map((block) => {
      if (block.type !== 'text' || !block.text || !isJsonString(block.text)) {
        return block; // Not JSON — leave unchanged
      }

      try {
        const parsed = JSON.parse(block.text) as Record<string, unknown>;
        const filtered = extractFromObject(parsed, fields);
        if (filtered) {
          return { ...block, text: JSON.stringify(filtered) };
        }
      } catch {
        // Parse failed — leave unchanged
      }

      return block;
    });

    // Only return modified data if at least one block was actually filtered
    const changed = newContent.some((block, i) => block !== content[i]);
    if (changed) {
      return { ...data, content: newContent };
    }
  }

  // 3. Nothing was JSON-parseable or no fields matched — return original data unchanged
  return data;
}
