import { Command } from 'commander';

const program = new Command();
program.name('mcpd').version('0.1.0').description('MCP server proxy/aggregator');
program.parse();
