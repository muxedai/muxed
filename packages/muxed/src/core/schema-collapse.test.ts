import { describe, it, expect } from 'vitest';
import { collapseSchema, extractSubtree, autoDepth, buildHint } from './schema-collapse.js';

describe('buildHint', () => {
  it('hints object with properties', () => {
    expect(buildHint({ type: 'object', properties: { a: {}, b: {}, c: {} } })).toBe('3 properties');
  });

  it('hints object with required properties', () => {
    expect(
      buildHint({
        type: 'object',
        properties: { a: {}, b: {}, c: {} },
        required: ['a', 'b'],
      })
    ).toBe('3 properties, 2 required');
  });

  it('hints single property', () => {
    expect(buildHint({ type: 'object', properties: { a: {} } })).toBe('1 property');
  });

  it('hints map type', () => {
    expect(
      buildHint({
        type: 'object',
        additionalProperties: { type: 'string' },
      })
    ).toBe('map<string, string>');
  });

  it('hints array with object items', () => {
    expect(
      buildHint({
        type: 'array',
        items: { type: 'object', properties: { x: {}, y: {} } },
      })
    ).toBe('items: object (2 properties)');
  });

  it('hints array with scalar items', () => {
    expect(buildHint({ type: 'array', items: { type: 'string' } })).toBe('items: string');
  });

  it('hints anyOf', () => {
    expect(buildHint({ anyOf: [{}, {}, {}] })).toBe('anyOf: 3 variants');
  });

  it('hints oneOf', () => {
    expect(buildHint({ oneOf: [{}, {}] })).toBe('oneOf: 2 variants');
  });

  it('hints allOf', () => {
    expect(buildHint({ allOf: [{}, {}, {}, {}] })).toBe('allOf: 4 schemas');
  });

  it('hints enum', () => {
    expect(buildHint({ type: 'string', enum: ['a', 'b', 'c'] })).toBe('enum: 3 values');
  });

  it('falls back to type', () => {
    expect(buildHint({ type: 'object' })).toBe('object');
  });

  it('falls back to schema for unknown', () => {
    expect(buildHint({})).toBe('schema');
  });
});

describe('collapseSchema', () => {
  it('does not collapse leaf schemas', () => {
    const schema = { type: 'string', description: 'a name' };
    const result = collapseSchema(schema, 0);
    expect(result.schema).toEqual(schema);
    expect(result.hasCollapsed).toBe(false);
  });

  it('does not collapse scalar types regardless of depth', () => {
    for (const type of ['string', 'number', 'integer', 'boolean', 'null']) {
      const result = collapseSchema({ type }, 0);
      expect(result.hasCollapsed).toBe(false);
    }
  });

  it('does not collapse $ref nodes', () => {
    const schema = { $ref: '#/definitions/Foo' };
    const result = collapseSchema(schema, 0);
    expect(result.schema).toEqual(schema);
    expect(result.hasCollapsed).toBe(false);
  });

  it('does not collapse empty schema', () => {
    const result = collapseSchema({}, 0);
    expect(result.schema).toEqual({});
    expect(result.hasCollapsed).toBe(false);
  });

  it('at depth 0 preserves root structure but collapses nested property values', () => {
    const schema = {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
        filters: {
          type: 'object',
          properties: { status: { type: 'string' } },
        },
      },
      required: ['query'],
    };
    const result = collapseSchema(schema, 0);
    expect(result.hasCollapsed).toBe(true);
    // Root is NOT collapsed — its structure is preserved
    expect(result.schema._collapsed).toBeUndefined();
    expect(result.schema.type).toBe('object');
    expect(result.schema.required).toEqual(['query']);
    // Leaf properties preserved
    const props = result.schema.properties as Record<string, Record<string, unknown>>;
    expect(props.query).toEqual({ type: 'string' });
    expect(props.limit).toEqual({ type: 'number' });
    // Non-leaf property collapsed
    expect(props.filters!._collapsed).toBe(true);
    expect(props.filters!._hint).toBe('1 property');
  });

  it('expands depth 1 — shows properties and their children, collapses grandchildren', () => {
    const schema = {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        filters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['active', 'archived'] },
            tags: {
              type: 'array',
              items: {
                type: 'object',
                properties: { name: { type: 'string' }, color: { type: 'string' } },
              },
            },
          },
        },
      },
      required: ['query'],
    };

    const result = collapseSchema(schema, 1);
    expect(result.hasCollapsed).toBe(true);

    const props = result.schema.properties as Record<string, Record<string, unknown>>;
    // Leaf property preserved
    expect(props.query).toEqual({ type: 'string', description: 'Search query' });
    // filters at depth 1: its structure shown, but grandchildren collapsed
    expect(props.filters!._collapsed).toBeUndefined(); // NOT collapsed
    const filterProps = props.filters!.properties as Record<string, Record<string, unknown>>;
    expect(filterProps.status).toEqual({ type: 'string', enum: ['active', 'archived'] }); // leaf
    // tags is non-leaf (has items) at depth 2 → collapsed
    expect(filterProps.tags).toEqual({
      type: 'array',
      _collapsed: true,
      _hint: 'items: object (2 properties)',
    });
    // Required preserved at root
    expect(result.schema.required).toEqual(['query']);
  });

  it('fully expands when depth exceeds nesting', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };
    const result = collapseSchema(schema, 10);
    expect(result.hasCollapsed).toBe(false);
    expect(result.schema).toEqual(schema);
  });

  it('handles nested arrays', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          nested: {
            type: 'object',
            properties: { deep: { type: 'string' } },
          },
        },
      },
    };

    // Depth 0: items at depth 1 — collapsed (non-leaf)
    const d0 = collapseSchema(schema, 0);
    expect(d0.hasCollapsed).toBe(true);
    const items0 = d0.schema.items as Record<string, unknown>;
    expect(items0._collapsed).toBe(true);

    // Depth 1: items expanded, nested collapsed at depth 2
    const d1 = collapseSchema(schema, 1);
    expect(d1.hasCollapsed).toBe(true);
    const items1 = d1.schema.items as Record<string, Record<string, Record<string, unknown>>>;
    expect(items1.properties!.id).toEqual({ type: 'number' }); // leaf
    expect(items1.properties!.nested!._collapsed).toBe(true);

    // Depth 2: fully expanded
    const d2 = collapseSchema(schema, 2);
    expect(d2.hasCollapsed).toBe(false);
  });

  it('handles anyOf at same depth — always recurses into variants', () => {
    const schema = {
      anyOf: [
        { type: 'string' },
        {
          type: 'object',
          properties: {
            x: { type: 'number' },
            nested: {
              type: 'object',
              properties: { deep: { type: 'string' } },
            },
          },
        },
      ],
    };

    // Depth 0: anyOf variants at same depth 0, each variant's properties collapsed
    const d0 = collapseSchema(schema, 0);
    expect(d0.hasCollapsed).toBe(true);
    const variants0 = d0.schema.anyOf as Record<string, unknown>[];
    expect(variants0[0]).toEqual({ type: 'string' }); // leaf, not collapsed
    // Object variant: root preserved, nested property collapsed
    const objVariant = variants0[1] as Record<string, Record<string, Record<string, unknown>>>;
    expect(objVariant.properties!.x).toEqual({ type: 'number' }); // leaf, kept
    expect(objVariant.properties!.nested!._collapsed).toBe(true);

    // Depth 1: fully expanded
    const d1 = collapseSchema(schema, 1);
    expect(d1.hasCollapsed).toBe(false);
  });

  it('handles additionalProperties as schema', () => {
    const schema = {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          v: { type: 'string' },
          nested: { type: 'object', properties: { x: { type: 'number' } } },
        },
      },
    };

    // Depth 0: additionalProperties at depth 1 — collapsed
    const d0 = collapseSchema(schema, 0);
    expect(d0.hasCollapsed).toBe(true);
    const ap0 = d0.schema.additionalProperties as Record<string, unknown>;
    expect(ap0._collapsed).toBe(true);

    // Depth 1: additionalProperties expanded, nested collapsed at depth 2
    const d1 = collapseSchema(schema, 1);
    expect(d1.hasCollapsed).toBe(true);
    const ap1 = d1.schema.additionalProperties as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(ap1.properties!.v).toEqual({ type: 'string' }); // leaf
    expect(ap1.properties!.nested!._collapsed).toBe(true);

    // Depth 2: fully expanded
    const d2 = collapseSchema(schema, 2);
    expect(d2.hasCollapsed).toBe(false);
  });

  it('handles additionalProperties as boolean', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      additionalProperties: false,
    };
    const result = collapseSchema(schema, 1);
    expect(result.schema.additionalProperties).toBe(false);
  });

  it('preserves description on collapsed nodes', () => {
    const schema = {
      type: 'object',
      description: 'Filter criteria',
      properties: {
        nested: {
          type: 'object',
          description: 'Nested filter',
          properties: { x: { type: 'string' } },
        },
      },
    };
    // At depth 0, 'nested' is at depth 1 — collapsed
    const result = collapseSchema(schema, 0);
    expect(result.hasCollapsed).toBe(true);
    // Root description preserved
    expect(result.schema.description).toBe('Filter criteria');
    // Collapsed child preserves its description
    const props = result.schema.properties as Record<string, Record<string, unknown>>;
    expect(props.nested!._collapsed).toBe(true);
    expect(props.nested!.description).toBe('Nested filter');
  });

  it('handles $defs at depth + 1', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string' } },
      $defs: {
        Foo: {
          type: 'object',
          properties: {
            bar: { type: 'string' },
            nested: { type: 'object', properties: { x: { type: 'number' } } },
          },
        },
      },
    };

    // Depth 0: $defs entries at depth 1 — collapsed
    const d0 = collapseSchema(schema, 0);
    const defs0 = d0.schema.$defs as Record<string, Record<string, unknown>>;
    expect(defs0.Foo!._collapsed).toBe(true);

    // Depth 1: Foo expanded, its nested property collapsed at depth 2
    const d1 = collapseSchema(schema, 1);
    const defs1 = d1.schema.$defs as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;
    expect(defs1.Foo!.properties!.bar).toEqual({ type: 'string' }); // leaf
    expect(defs1.Foo!.properties!.nested!._collapsed).toBe(true);
  });

  it('handles patternProperties', () => {
    const schema = {
      type: 'object',
      patternProperties: {
        '^x-': {
          type: 'object',
          properties: {
            v: { type: 'string' },
            nested: { type: 'object', properties: { y: { type: 'number' } } },
          },
        },
      },
    };

    // Depth 0: patternProperties entries at depth 1 — collapsed
    const d0 = collapseSchema(schema, 0);
    const pp0 = d0.schema.patternProperties as Record<string, Record<string, unknown>>;
    expect(pp0['^x-']!._collapsed).toBe(true);

    // Depth 1: expanded, nested collapsed
    const d1 = collapseSchema(schema, 1);
    const pp1 = d1.schema.patternProperties as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;
    expect(pp1['^x-']!.properties!.v).toEqual({ type: 'string' });
    expect(pp1['^x-']!.properties!.nested!._collapsed).toBe(true);
  });

  it('handles if/then/else at same depth — recurses into branches', () => {
    const schema = {
      if: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          nested: { type: 'object', properties: { x: { type: 'number' } } },
        },
      },
      then: {
        type: 'object',
        properties: {
          b: { type: 'string' },
          nested: { type: 'object', properties: { y: { type: 'number' } } },
        },
      },
      else: {
        type: 'object',
        properties: {
          c: { type: 'string' },
          nested: { type: 'object', properties: { z: { type: 'number' } } },
        },
      },
    };

    // Depth 0: if/then/else at same depth, their property values collapsed
    const d0 = collapseSchema(schema, 0);
    expect(d0.hasCollapsed).toBe(true);
    const ifBranch = d0.schema.if as Record<string, Record<string, Record<string, unknown>>>;
    expect(ifBranch.properties!.a).toEqual({ type: 'string' }); // leaf, kept
    expect(ifBranch.properties!.nested!._collapsed).toBe(true);
    const thenBranch = d0.schema.then as Record<string, Record<string, Record<string, unknown>>>;
    expect(thenBranch.properties!.nested!._collapsed).toBe(true);
    const elseBranch = d0.schema.else as Record<string, Record<string, Record<string, unknown>>>;
    expect(elseBranch.properties!.nested!._collapsed).toBe(true);
  });

  it('handles not at same depth — recurses into inner schema', () => {
    const schema = {
      not: {
        type: 'object',
        properties: {
          a: { type: 'string' },
          nested: { type: 'object', properties: { x: { type: 'number' } } },
        },
      },
    };

    const d0 = collapseSchema(schema, 0);
    expect(d0.hasCollapsed).toBe(true);
    const notSchema = d0.schema.not as Record<string, Record<string, Record<string, unknown>>>;
    expect(notSchema.properties!.a).toEqual({ type: 'string' }); // leaf, kept
    expect(notSchema.properties!.nested!._collapsed).toBe(true);
  });
});

describe('extractSubtree', () => {
  const schema = {
    type: 'object',
    properties: {
      query: { type: 'string' },
      filters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'archived'] },
          tags: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                color: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };

  it('extracts top-level property', () => {
    expect(extractSubtree(schema, 'query')).toEqual({ type: 'string' });
  });

  it('extracts nested property', () => {
    const result = extractSubtree(schema, 'filters.status');
    expect(result).toEqual({ type: 'string', enum: ['active', 'archived'] });
  });

  it('extracts through items', () => {
    const result = extractSubtree(schema, 'filters.tags.items');
    expect(result?.type).toBe('object');
    expect((result?.properties as Record<string, unknown>)?.name).toEqual({ type: 'string' });
  });

  it('extracts deeply nested', () => {
    const result = extractSubtree(schema, 'filters.tags.items.name');
    expect(result).toEqual({ type: 'string' });
  });

  it('returns undefined for invalid path', () => {
    expect(extractSubtree(schema, 'nonexistent')).toBeUndefined();
  });

  it('returns undefined for invalid nested path', () => {
    expect(extractSubtree(schema, 'query.nested')).toBeUndefined();
  });

  it('extracts through additionalProperties', () => {
    const s = {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: { v: { type: 'string' } },
      },
    };
    const result = extractSubtree(s, 'additionalProperties.v');
    expect(result).toEqual({ type: 'string' });
  });

  it('extracts through numeric index into oneOf', () => {
    const s = {
      oneOf: [{ type: 'string' }, { type: 'object', properties: { a: { type: 'number' } } }],
    };
    expect(extractSubtree(s, '1')).toEqual({
      type: 'object',
      properties: { a: { type: 'number' } },
    });
    expect(extractSubtree(s, '0')).toEqual({ type: 'string' });
  });

  it('extracts through patternProperties', () => {
    const s = {
      type: 'object',
      patternProperties: {
        '^x-': { type: 'string' },
      },
    };
    expect(extractSubtree(s, '^x-')).toEqual({ type: 'string' });
  });

  it('returns the root schema for empty path segments gracefully', () => {
    // Edge case: extract with the schema itself being returned
    const s = { type: 'string' };
    // A single-segment path that doesn't match should return undefined
    expect(extractSubtree(s, 'nope')).toBeUndefined();
  });
});

describe('autoDepth', () => {
  it('returns fullyExpanded for empty schemas', () => {
    expect(autoDepth([])).toEqual({ depth: 0, fullyExpanded: true });
  });

  it('returns fullyExpanded for simple schemas within budget', () => {
    const schemas = [
      { type: 'object', properties: { a: { type: 'string' } } },
      { type: 'object', properties: { b: { type: 'number' } } },
    ];
    const result = autoDepth(schemas, 10_000);
    expect(result.fullyExpanded).toBe(true);
  });

  it('collapses when schemas exceed budget', () => {
    // Create a deeply nested schema that will be large
    const deepSchema: Record<string, unknown> = { type: 'object', properties: {} };
    let current = deepSchema;
    for (let i = 0; i < 10; i++) {
      const child: Record<string, unknown> = {
        type: 'object',
        description: `Level ${i} description that adds some characters`,
        properties: {},
      };
      (current.properties as Record<string, unknown>)[`level${i}`] = child;
      current = child;
    }
    // Add leaf properties at the bottom
    (current.properties as Record<string, unknown>).value = { type: 'string' };

    const result = autoDepth([deepSchema], 200); // Very tight budget
    expect(result.fullyExpanded).toBe(false);
    expect(result.depth).toBeGreaterThanOrEqual(0);
  });

  it('expands to max depth when budget allows', () => {
    const schema = {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
      },
    };
    const result = autoDepth([schema], 100_000);
    expect(result.fullyExpanded).toBe(true);
  });

  it('returns depth 0 when even collapsed exceeds budget', () => {
    // Many schemas that even at depth 0 produce a lot of output
    const schemas = Array.from({ length: 1000 }, (_, i) => ({
      type: 'object',
      description: `Schema ${i} with a somewhat long description to push over budget`,
      properties: { a: { type: 'string' } },
    }));
    const result = autoDepth(schemas, 100);
    expect(result.depth).toBe(0);
  });
});
