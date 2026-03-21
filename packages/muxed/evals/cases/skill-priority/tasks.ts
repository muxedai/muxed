import { z } from 'zod/v4';
import { loadYaml } from '../../lib/load-tasks.ts';
import type { EvalTask } from '../../types.ts';

const taskSchema = z.array(
  z.object({
    name: z.string(),
    input: z.string(),
    expected: z.string(),
  })
);

export function loadTasks(yamlPath: string): EvalTask[] {
  return loadYaml(yamlPath, taskSchema).map((t) => ({
    name: t.name,
    input: t.input.trim(),
    expected: t.expected.trim(),
  }));
}
