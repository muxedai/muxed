import { z } from 'zod/v4';
import { loadYaml } from '../../lib/load-tasks.ts';
import type { EvalTask } from '../../types.ts';
import { generateTools } from './clusters.ts';

const taskSchema = z.array(
  z.object({
    name: z.string(),
    input: z.string(),
    expected: z.string(),
    correct_tool: z.object({
      cluster: z.string(),
      index: z.number().int().nonnegative(),
    }),
  })
);

export type ToolAccuracyTask = EvalTask & {
  correctToolByCount: Record<number, string>;
};

function resolveCorrectTool(
  toolCount: number,
  clusterName: string,
  preferredIndex: number,
  seed: number
): string {
  const tools = generateTools(toolCount, seed);
  const clusterTools = tools.filter((t) => t.cluster === clusterName);
  const tool = clusterTools[preferredIndex] ?? clusterTools[0];
  return tool?.name ?? 'unknown';
}

export function loadTasks(
  yamlPath: string,
  toolCounts: number[] = [10, 25, 50, 100],
  seed = 42
): ToolAccuracyTask[] {
  return loadYaml(yamlPath, taskSchema).map((t) => {
    const correctToolByCount: Record<number, string> = {};
    for (const count of toolCounts) {
      correctToolByCount[count] = resolveCorrectTool(
        count,
        t.correct_tool.cluster,
        t.correct_tool.index,
        seed
      );
    }
    return {
      name: t.name,
      input: t.input.trim(),
      expected: t.expected.trim(),
      correctToolByCount,
    };
  });
}
