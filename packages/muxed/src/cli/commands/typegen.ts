import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ensureDaemon, sendRequest } from '../client.js';
import { generateTypes, type ToolEntry } from '../../codegen/typegen.js';

export const typegenCommand = new Command('typegen')
  .description('Generate TypeScript types from tool schemas for type-safe tool calls')
  .option('-c, --config <path>', 'Path to muxed.config.json')
  .action(async (opts: { config?: string }) => {
    const configPath = typegenCommand.parent?.opts().config ?? opts.config;
    await ensureDaemon(configPath);

    const tools = (await sendRequest('tools/list')) as ToolEntry[];

    const content = await generateTypes(tools);

    // Resolve node_modules/muxed/ from the user's project
    const require = createRequire(path.resolve('package.json'));
    const muxedPkgDir = path.dirname(require.resolve('muxed/package.json'));
    const outputPath = path.join(muxedPkgDir, 'muxed.generated.d.ts');

    fs.writeFileSync(outputPath, content, 'utf-8');

    console.log(`Generated ${tools.length} tool types → ${outputPath}`);
  });
