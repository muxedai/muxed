type JsonSchema = Record<string, unknown>;

type CollapseResult = {
  schema: JsonSchema;
  hasCollapsed: boolean;
};

type AutoDepthResult = {
  depth: number;
  fullyExpanded: boolean;
};

const DEFAULT_BUDGET = 48_000;

function isLeaf(schema: JsonSchema): boolean {
  const type = schema.type as string | undefined;
  if (
    type === 'string' ||
    type === 'number' ||
    type === 'integer' ||
    type === 'boolean' ||
    type === 'null'
  ) {
    // Even scalars with enum/const are leaves
    if (!schema.anyOf && !schema.oneOf && !schema.allOf) return true;
  }
  if (schema.$ref) return true;
  // No structural children = leaf
  if (
    !schema.properties &&
    !schema.items &&
    !schema.additionalProperties &&
    !schema.patternProperties &&
    !schema.anyOf &&
    !schema.oneOf &&
    !schema.allOf &&
    !schema.if &&
    !schema.not
  ) {
    return true;
  }
  return false;
}

export function buildHint(schema: JsonSchema): string {
  const parts: string[] = [];

  // Object with properties
  const props = schema.properties as Record<string, unknown> | undefined;
  if (props) {
    const count = Object.keys(props).length;
    const required = schema.required as string[] | undefined;
    if (required && required.length > 0) {
      parts.push(`${count} properties, ${required.length} required`);
    } else {
      parts.push(`${count} ${count === 1 ? 'property' : 'properties'}`);
    }
    return parts.join(', ');
  }

  // Object with additionalProperties only
  if (schema.type === 'object' && schema.additionalProperties) {
    const addProps = schema.additionalProperties as JsonSchema;
    const valueType = (addProps.type as string) ?? 'unknown';
    return `map<string, ${valueType}>`;
  }

  // Array
  if (schema.items) {
    const items = schema.items as JsonSchema;
    if (items.type === 'object' && items.properties) {
      const count = Object.keys(items.properties as Record<string, unknown>).length;
      return `items: object (${count} ${count === 1 ? 'property' : 'properties'})`;
    }
    return `items: ${(items.type as string) ?? 'unknown'}`;
  }

  // Unions
  for (const keyword of ['anyOf', 'oneOf'] as const) {
    const variants = schema[keyword] as JsonSchema[] | undefined;
    if (variants) {
      return `${keyword}: ${variants.length} variants`;
    }
  }
  if (schema.allOf) {
    const allOf = schema.allOf as JsonSchema[];
    return `allOf: ${allOf.length} schemas`;
  }

  // Enum
  if (schema.enum) {
    const values = schema.enum as unknown[];
    return `enum: ${values.length} values`;
  }

  // Fallback
  return (schema.type as string) ?? 'schema';
}

function buildCollapsedNode(schema: JsonSchema): JsonSchema {
  const result: JsonSchema = {};
  if (schema.type) result.type = schema.type;
  if (schema.description) result.description = schema.description;
  result._collapsed = true;
  result._hint = buildHint(schema);
  return result;
}

/**
 * Collapse a child schema that lives at depth+1 from the current node.
 * If the child exceeds the depth limit, it is collapsed to a summary.
 * Leaf schemas are never collapsed regardless of depth.
 */
function collapseChild(schema: JsonSchema, childDepth: number, maxDepth: number): CollapseResult {
  if (typeof schema !== 'object' || schema === null) {
    return { schema, hasCollapsed: false };
  }
  if (isLeaf(schema)) {
    return { schema, hasCollapsed: false };
  }
  if (childDepth > maxDepth) {
    return { schema: buildCollapsedNode(schema), hasCollapsed: true };
  }
  return collapseNode(schema, childDepth, maxDepth);
}

function collapseNode(schema: JsonSchema, currentDepth: number, maxDepth: number): CollapseResult {
  // Boolean schemas
  if (typeof schema !== 'object' || schema === null) {
    return { schema, hasCollapsed: false };
  }

  // Leaf nodes are never collapsed
  if (isLeaf(schema)) {
    return { schema, hasCollapsed: false };
  }

  // Recurse into children. Depth+1 children (properties, items, etc.)
  // are collapsed if they exceed the limit. Same-depth children
  // (anyOf, oneOf, allOf, if/then/else, not) always recurse.
  let hasCollapsed = false;
  const result: JsonSchema = {};

  for (const [key, value] of Object.entries(schema)) {
    switch (key) {
      case 'properties': {
        const props = value as Record<string, JsonSchema>;
        const newProps: Record<string, JsonSchema> = {};
        for (const [propName, propSchema] of Object.entries(props)) {
          const collapsed = collapseChild(propSchema, currentDepth + 1, maxDepth);
          newProps[propName] = collapsed.schema;
          if (collapsed.hasCollapsed) hasCollapsed = true;
        }
        result.properties = newProps;
        break;
      }

      case 'items': {
        const items = value as JsonSchema;
        const collapsed = collapseChild(items, currentDepth + 1, maxDepth);
        result.items = collapsed.schema;
        if (collapsed.hasCollapsed) hasCollapsed = true;
        break;
      }

      case 'additionalProperties': {
        if (typeof value === 'object' && value !== null) {
          const collapsed = collapseChild(value as JsonSchema, currentDepth + 1, maxDepth);
          result.additionalProperties = collapsed.schema;
          if (collapsed.hasCollapsed) hasCollapsed = true;
        } else {
          result.additionalProperties = value;
        }
        break;
      }

      case 'patternProperties': {
        const patterns = value as Record<string, JsonSchema>;
        const newPatterns: Record<string, JsonSchema> = {};
        for (const [pattern, patternSchema] of Object.entries(patterns)) {
          const collapsed = collapseChild(patternSchema, currentDepth + 1, maxDepth);
          newPatterns[pattern] = collapsed.schema;
          if (collapsed.hasCollapsed) hasCollapsed = true;
        }
        result.patternProperties = newPatterns;
        break;
      }

      // Logical combinators — same depth, always recurse
      case 'anyOf':
      case 'oneOf':
      case 'allOf': {
        const variants = value as JsonSchema[];
        const newVariants: JsonSchema[] = [];
        for (const variant of variants) {
          const collapsed = collapseNode(variant, currentDepth, maxDepth);
          newVariants.push(collapsed.schema);
          if (collapsed.hasCollapsed) hasCollapsed = true;
        }
        result[key] = newVariants;
        break;
      }

      case 'if':
      case 'then':
      case 'else':
      case 'not': {
        const sub = value as JsonSchema;
        const collapsed = collapseNode(sub, currentDepth, maxDepth);
        result[key] = collapsed.schema;
        if (collapsed.hasCollapsed) hasCollapsed = true;
        break;
      }

      case '$defs':
      case 'definitions': {
        const defs = value as Record<string, JsonSchema>;
        const newDefs: Record<string, JsonSchema> = {};
        for (const [defName, defSchema] of Object.entries(defs)) {
          const collapsed = collapseChild(defSchema, currentDepth + 1, maxDepth);
          newDefs[defName] = collapsed.schema;
          if (collapsed.hasCollapsed) hasCollapsed = true;
        }
        result[key] = newDefs;
        break;
      }

      default:
        result[key] = value;
    }
  }

  return { schema: result, hasCollapsed };
}

/**
 * Collapse a JSON Schema to a maximum depth. Beyond that depth,
 * nodes are replaced with collapsed summaries containing `_collapsed: true`
 * and a `_hint` string describing the collapsed content.
 *
 * Leaf schemas (scalars, $ref) are never collapsed.
 */
export function collapseSchema(schema: JsonSchema, maxDepth: number): CollapseResult {
  const depth = Math.max(0, maxDepth);
  return collapseNode(schema, 0, depth);
}

/**
 * Navigate into a JSON Schema by a dot-separated path.
 * Each segment navigates through `properties`, or matches `items`
 * or `additionalProperties` literally.
 *
 * Returns the subtree schema, or undefined if the path doesn't resolve.
 */
export function extractSubtree(schema: JsonSchema, path: string): JsonSchema | undefined {
  const segments = path.split('.');
  let current: JsonSchema = schema;

  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined;

    // Try properties first
    const props = current.properties as Record<string, JsonSchema> | undefined;
    if (props && segment in props) {
      current = props[segment]!;
      continue;
    }

    // Literal 'items'
    if (segment === 'items' && current.items) {
      current = current.items as JsonSchema;
      continue;
    }

    // Literal 'additionalProperties'
    if (segment === 'additionalProperties' && typeof current.additionalProperties === 'object') {
      current = current.additionalProperties as JsonSchema;
      continue;
    }

    // Numeric index into anyOf/oneOf/allOf
    const index = parseInt(segment, 10);
    if (!isNaN(index)) {
      for (const keyword of ['anyOf', 'oneOf', 'allOf'] as const) {
        const variants = current[keyword] as JsonSchema[] | undefined;
        if (variants && index >= 0 && index < variants.length) {
          current = variants[index]!;
          break;
        }
      }
      if (current !== schema) continue;
    }

    // patternProperties
    const patterns = current.patternProperties as Record<string, JsonSchema> | undefined;
    if (patterns && segment in patterns) {
      current = patterns[segment]!;
      continue;
    }

    return undefined;
  }

  return current;
}

/**
 * Find the deepest collapse depth that keeps total serialized size
 * under a character budget.
 */
export function autoDepth(
  schemas: JsonSchema[],
  budgetChars: number = DEFAULT_BUDGET
): AutoDepthResult {
  if (schemas.length === 0) return { depth: 0, fullyExpanded: true };

  let depth = 1;
  let lastFit = 0;
  let lastFullyExpanded = false;

  // Depth 0 always fits (it's the most collapsed — just type + hint per schema)
  // But check if even depth 0 exceeds budget
  const depth0 = schemas.map((s) => collapseSchema(s, 0));
  const depth0Size = depth0.reduce((sum, r) => sum + JSON.stringify(r.schema).length, 0);
  const depth0Expanded = depth0.every((r) => !r.hasCollapsed);
  if (depth0Size > budgetChars) {
    return { depth: 0, fullyExpanded: depth0Expanded };
  }
  lastFit = 0;
  lastFullyExpanded = depth0Expanded;

  if (depth0Expanded) return { depth: 0, fullyExpanded: true };

  // Try increasing depths
  for (depth = 1; depth <= 20; depth++) {
    const results = schemas.map((s) => collapseSchema(s, depth));
    const totalSize = results.reduce((sum, r) => sum + JSON.stringify(r.schema).length, 0);
    const fullyExpanded = results.every((r) => !r.hasCollapsed);

    if (totalSize > budgetChars) {
      return { depth: lastFit, fullyExpanded: lastFullyExpanded };
    }

    lastFit = depth;
    lastFullyExpanded = fullyExpanded;

    if (fullyExpanded) {
      return { depth, fullyExpanded: true };
    }
  }

  return { depth: lastFit, fullyExpanded: lastFullyExpanded };
}
