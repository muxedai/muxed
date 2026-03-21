import fs from 'node:fs';
import yaml from 'js-yaml';
import type { z } from 'zod/v4';

/**
 * Load a YAML file and validate it against a Zod schema.
 */
export function loadYaml<T>(yamlPath: string, schema: z.ZodType<T>): T {
  const raw = yaml.load(fs.readFileSync(yamlPath, 'utf-8'));
  return schema.parse(raw);
}
