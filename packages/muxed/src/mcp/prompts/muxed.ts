import type { ServerState } from '../../core/types.js';

export type InstructionMode = 'cli' | 'tool';

type Fragments = {
  intro: string;
  grep: (pattern: string) => string;
  tools: (server?: string) => string;
  toolsSchema: (server?: string) => string;
  info: (name: string) => string;
  infoDepth: (name: string, depth: number) => string;
  infoPath: (name: string, path: string) => string;
  call: (name: string, json: string) => string;
  callStdin: (name: string) => string;
  callDryRun: (name: string, json: string) => string;
  callFields: (name: string, json: string, fields: string) => string;
  servers: () => string;
  resources: (server?: string) => string;
  read: (name: string) => string;
  help: () => string;
};

const cliFragments: Fragments = {
  intro:
    'You have access to an `npx muxed` CLI command for interacting with MCP (Model Context Protocol) servers. This command allows you to discover and call MCP tools on demand. Prioritize the use of skills over MCP tools.',
  grep: (p) => `npx muxed grep "${p}"`,
  tools: (s) => (s ? `npx muxed tools ${s}` : 'npx muxed tools'),
  toolsSchema: (s) =>
    s ? `npx muxed tools ${s} --include schema` : 'npx muxed tools --include schema',
  info: (n) => `npx muxed info ${n}`,
  infoDepth: (n, d) => `npx muxed info ${n} --depth ${d}`,
  infoPath: (n, p) => `npx muxed info ${n} --path ${p}`,
  call: (n, j) => `npx muxed call ${n} '${j}'`,
  callStdin: (n) => `npx muxed call ${n} -`,
  callDryRun: (n, j) => `npx muxed call ${n} '${j}' --dry-run`,
  callFields: (n, j, f) => `npx muxed call ${n} '${j}' --fields "${f}"`,
  servers: () => 'npx muxed servers',
  resources: (s) => (s ? `npx muxed resources ${s}` : 'npx muxed resources'),
  read: (n) => `npx muxed read ${n}`,
  help: () => 'npx muxed -h',
};

const toolFragments: Fragments = {
  intro:
    'You have access to a `muxed:exec` MCP tool for interacting with MCP (Model Context Protocol) servers. This tool allows you to discover and call MCP tools on demand. Prioritize the use of skills over MCP tools.',
  grep: (p) => `muxed:exec({ "command": "grep ${p}" })`,
  tools: (s) =>
    s ? `muxed:exec({ "command": "tools ${s}" })` : `muxed:exec({ "command": "tools" })`,
  toolsSchema: (s) =>
    s
      ? `muxed:exec({ "command": "tools ${s} --include schema" })`
      : `muxed:exec({ "command": "tools --include schema" })`,
  info: (n) => `muxed:exec({ "command": "info ${n}" })`,
  infoDepth: (n, d) => `muxed:exec({ "command": "info ${n} --depth ${d}" })`,
  infoPath: (n, p) => `muxed:exec({ "command": "info ${n} --path ${p}" })`,
  call: (n, j) => `muxed:exec({ "command": "call ${n}", "input": ${j} })`,
  callStdin: (n) => `muxed:exec({ "command": "call ${n}", "input": { ... } })`,
  callDryRun: (n, j) => `muxed:exec({ "command": "call ${n}", "input": ${j} })`,
  callFields: (n, j, _f) => `muxed:exec({ "command": "call ${n}", "input": ${j} })`,
  servers: () => `muxed:exec({ "command": "servers" })`,
  resources: (s) =>
    s ? `muxed:exec({ "command": "resources ${s}" })` : `muxed:exec({ "command": "resources" })`,
  read: (n) => `muxed:exec({ "command": "read ${n}" })`,
  help: () => `muxed:exec({ "command": "servers" })`,
};

function buildTemplate(f: Fragments, servers: string, instructions: string): string {
  return `
${f.intro}

**MANDATORY PREREQUISITES - THESE ARE HARD REQUIREMENTS**

1. You MUST discover the tools you need first by using '${f.grep('<pattern>')}' or '${f.tools()}'.
2. You MUST call '${f.info('<server>/<tool>')}' BEFORE ANY '${f.call('<server>/<tool>', '<json>')}' command.

These are BLOCKING REQUIREMENTS - like how you must use Read before Edit.

**NEVER** make a call without checking the schema first.
**ALWAYS** run info first, THEN make the call.

**Why these are non-negotiables:**
- MCP tool names NEVER match your expectations - they change frequently and are not predictable
- MCP tool schemas NEVER match your expectations - parameter names, types, and requirements are tool-specific
- Even tools with pre-approved permissions require schema checks
- Every failed call wastes user time and demonstrates you're ignoring critical instructions
- "I thought I knew the schema" is not an acceptable reason to skip this step

**For multiple tools:** Call info for ALL tools in parallel FIRST, then make your call commands.

Available MCP servers:
${servers}

Commands (in order of execution):
\`\`\`
# STEP 1: REQUIRED TOOL DISCOVERY
${f.grep('<pattern>')}                 # Search tool names and descriptions
${f.tools('[server]')}                 # List available tools (optionally filter by server)

# STEP 2: GET SCHEMA (choose one approach)
# Option A: Include schemas in tool listing (auto-collapses to fit 48k budget)
${f.toolsSchema('[server]')}           # List tools with schemas included
# Option B: Get full schema for a specific tool
${f.info('<server>/<tool>')}           # View full JSON schema for one tool

# STEP 2b: PROGRESSIVE SCHEMA EXPLORATION (for large schemas)
${f.infoDepth('<server>/<tool>', 1)}   # Collapse schema at depth 1 (top-level overview)
${f.infoPath('<server>/<tool>', 'filters')}  # Extract just the 'filters' subtree
${f.infoPath('<server>/<tool>', 'filters.tags.items')}  # Drill deeper into nested schemas

# STEP 3: OPTIONAL - Validate arguments before calling (dry-run)
${f.callDryRun('<server>/<tool>', '<json>')}  # Validate args without executing

# STEP 4: Only after getting the schema, make the call
${f.call('<server>/<tool>', '<json>')}  # Only run AFTER getting schema
${f.callStdin('<server>/<tool>')}       # Invoke with JSON input
${f.callFields('<server>/<tool>', '<json>', 'field1,field2')}  # Extract specific fields from response

# Discovery commands (use these to find tools)
${f.servers()}                          # List all connected MCP servers
${f.tools('[server]')}                  # List available tools (optionally filter by server)
${f.grep('<pattern>')}                  # Search tool names and descriptions
${f.resources('[server]')}              # List MCP resources
${f.read('<server>/<resource>')}        # Read an MCP resource
\`\`\`

**Handling errors:**
- If a tool call fails, the error includes a suggestion and similar tool names. Read the suggestion before retrying.
- Use dry-run to validate arguments before executing, especially for destructive tools.

**CORRECT Usage Pattern:**

<example>
User: Please use the slack mcp tool to search for my mentions
Assistant: As a first step, I need to discover the tools I need. Let me call \`${f.grep('slack/*search*')}\` to search for tools related to slack search.
[Calls ${f.grep('slack/*search*')}]
Assistant: I need to check the schema first. Let me call \`${f.info('slack/search_private')}\` to see what parameters it accepts.
[Calls ${f.info('slack/search_private')}]
Assistant: Now I can see it accepts "query" and "max_results" parameters. Let me make the call.
[Calls ${f.call('slack/search_private', '{"query": "mentions:me", "max_results": 10}')}]
</example>

<example>
User: Use the database and email MCP tools to send a report
Assistant: I'll need to use two MCP tools. Let me call \`${f.grep('database/*query*')}\` and \`${f.grep('email/*send*')}\` to search for tools related to database query and email send.
[Calls ${f.grep('database/*query*')} & ${f.grep('email/*send*')}]
Assistant: Let me check both schemas first.
[Calls ${f.info('database/query')} and ${f.info('email/send')} in parallel]
Assistant: Now I have both schemas. Let me make the calls.
[Makes both call commands with correct parameters]
</example>

<example>
User: Create a copy of this email
Assistant: Let me find the tool I need first.
[Calls ${f.grep('email/*copy*')}. No results found.]
Assistant: Let me try another pattern.
[Calls ${f.grep('email/*clone*')}. No results found.]
Assistant: Let me list all available tools in the server.
[Calls ${f.tools('email')}]
Assistant: Let me check the schema first.
[Calls ${f.info('email/duplicate')}]
Assistant: Now I have the schema. Let me make the call.
[Calls ${f.call('email/duplicate', '{"id": "123"}')}]
</example>

**INCORRECT Usage Patterns - NEVER DO THIS:**

<bad-example>
User: Please use the slack mcp tool to search for my mentions
Assistant: [Directly calls ${f.call('slack/search_private', '{"query": "mentions:me"}')} with guessed parameters]
WRONG - You must call info FIRST
</bad-example>

<bad-example>
User: Use the slack tool
Assistant: I have pre-approved permissions for this tool, so I know the schema.
[Calls ${f.call('slack/search_private', '...')} directly]
WRONG - Pre-approved permissions don't mean you know the schema. ALWAYS call info first.
</bad-example>

<bad-example>
User: Search my Slack mentions
Assistant: [Calls three call commands in parallel without any info calls first]
WRONG - You must call info for ALL tools before making ANY call commands
</bad-example>

Example usage:
\`\`\`
# Discover tools
${f.tools()}                          # See all available MCP tools
${f.grep('weather')}                  # Find tools by description

# Get tool schemas (choose the approach that fits)
${f.toolsSchema()}                    # All tools with schemas (auto-collapses large schemas)
${f.toolsSchema('slack')}             # Schemas for one server
${f.info('<server>/<tool>')}          # Full schema for one tool

# Progressive schema exploration (for complex tools)
${f.infoDepth('<server>/<tool>', 0)}  # Top-level structure only
${f.infoPath('<server>/<tool>', 'filters')}  # Drill into a subtree
${f.infoPath('<server>/<tool>', 'filters.tags.items')}  # Drill deeper

# Simple tool call (no parameters)
${f.call('weather/get_location', '{}')}

# Tool call with parameters
${f.call('database/query', '{"table": "users", "limit": 10}')}

# Validate arguments before executing (dry-run)
${f.callDryRun('database/drop_table', '{"table": "users"}')}

# Extract specific fields from response
${f.callFields('database/query', '{"table": "users"}', 'rows[].name,rows[].email')}
\`\`\`

Call \`${f.help()}\` to see all available commands.

Below are the instructions for the connected MCP servers in muxed.

${instructions}
`;
}

export function buildInstructions(servers: ServerState[], mode: InstructionMode = 'cli'): string {
  const connected = servers.filter((s) => s.status === 'connected');

  const serverList = connected.map((s) => `- ${s.name}`).join('\n');

  const serverInstructions = connected
    .filter((s) => s.instructions)
    .map((s) => `### ${s.name}\n\n${s.instructions}`)
    .join('\n\n');

  const fragments = mode === 'tool' ? toolFragments : cliFragments;
  return buildTemplate(fragments, serverList, serverInstructions).trim();
}
