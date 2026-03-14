/**
 * Field filtering for tool call responses.
 * Supports dot-notation paths with array bracket syntax.
 *
 * Examples:
 *   "rows[].name"    → extract `name` from each element of `rows`
 *   "content[].text"  → extract `text` from each content block
 *   "data.id"         → extract `data.id`
 */

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

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

/** Extract a value from an object following a parsed path. */
function extractPath(obj: unknown, segments: Array<{ key: string; isArray: boolean }>): unknown {
  let current: unknown = obj;

  for (const { key, isArray } of segments) {
    if (current == null || typeof current !== 'object') return undefined;

    current = (current as Record<string, unknown>)[key];

    if (isArray) {
      if (!Array.isArray(current)) return undefined;
      // Remaining segments apply to each element
      const remaining = segments.slice(segments.indexOf({ key, isArray }) + 1);
      if (remaining.length === 0) return current;

      // For array segments, we need to map over elements with remaining path
      const restSegments = segments.slice(
        segments.findIndex((s) => s.key === key && s.isArray) + 1
      );
      if (restSegments.length === 0) return current;
      return current.map((item) => extractPath(item, restSegments)).filter((v) => v !== undefined);
    }
  }

  return current;
}

/** Simpler recursive extraction that handles "rows[].name" correctly. */
function extract(obj: unknown, path: string): unknown {
  const segments = parsePath(path);
  return extractDeep(obj, segments);
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

/**
 * Filter an object to include only the specified field paths.
 * Also attempts to filter JSON embedded in text content blocks.
 */
export function filterFields(
  data: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    const value = extract(data, field);
    if (value !== undefined) {
      // Use the top-level key of the path
      const topKey = field.split('.')[0]!.replace('[]', '');
      // Store under the full path for clarity
      setNested(result, field.replace(/\[\]/g, '').split('.'), value);
    }
  }

  // If filtering produced nothing from structured data, try parsing text content blocks
  if (Object.keys(result).length === 0) {
    const content = data.content as Array<{ type: string; text?: string }> | undefined;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          try {
            const parsed = JSON.parse(block.text) as Record<string, unknown>;
            const filtered = filterFields(parsed, fields);
            if (Object.keys(filtered).length > 0) {
              return { ...data, content: [{ type: 'text', text: JSON.stringify(filtered) }] };
            }
          } catch {
            // Not JSON, skip
          }
        }
      }
    }

    // Also try structuredContent
    if (data.structuredContent && typeof data.structuredContent === 'object') {
      const filtered = filterFields(data.structuredContent as Record<string, unknown>, fields);
      if (Object.keys(filtered).length > 0) {
        return { ...data, structuredContent: filtered };
      }
    }
  }

  // If we got results from top-level, wrap back in the original shape
  if (Object.keys(result).length > 0) {
    // Preserve isError and content structure, but replace structuredContent
    if (data.structuredContent) {
      return { ...data, structuredContent: result };
    }
    // If filtering was on the response itself
    return result;
  }

  return data;
}
