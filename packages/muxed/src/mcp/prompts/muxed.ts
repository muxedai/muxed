import type { ServerState } from '../../core/types.js';

const cliInstructions = (servers: string, instructions: string) =>
  `
You have access to an \`npx muxed\` CLI command for interacting with MCP (Model Context Protocol) servers. This command allows you to discover and call MCP tools on demand. Prioritize the use of skills over MCP tools.

**MANDATORY PREREQUISITES - THESE ARE HARD REQUIREMENTS**

1. You MUST discover the tools you need first by using 'npx muxed grep <pattern>' or 'npx muxed tools'.
2. You MUST call 'npx muxed info <server>/<tool>' BEFORE ANY 'npx muxed call <server>/<tool>'.

These are BLOCKING REQUIREMENTS - like how you must use Read before Edit.

**NEVER** make an npx muxed call without checking the schema first.
**ALWAYS** run npx muxed info first, THEN make the call.

**Why these are non-negotiables:**
- MCP tool names NEVER match your expectations - they change frequently and are not predictable
- MCP tool schemas NEVER match your expectations - parameter names, types, and requirements are tool-specific
- Even tools with pre-approved permissions require schema checks
- Every failed call wastes user time and demonstrates you're ignoring critical instructions
- "I thought I knew the schema" is not an acceptable reason to skip this step

**For multiple tools:** Call 'npx muxed info' for ALL tools in parallel FIRST, then make your 'npx muxed call' commands.

Available MCP servers:
${servers}

Commands (in order of execution):
\`\`\`bash
# STEP 1: REQUIRED TOOL DISCOVERY
npx muxed grep <pattern>                 # Search tool names and descriptions
npx muxed tools [server]                 # List available tools (optionally filter by server)

# STEP 2: ALWAYS CHECK SCHEMA FIRST (MANDATORY)
npx muxed info <server>/<tool>           # REQUIRED before ANY call - View JSON schema

# STEP 3: Only after checking schema, make the call
npx muxed call <server>/<tool> '<json>'  # Only run AFTER npx muxed info
npx muxed call <server>/<tool> -         # Invoke with JSON from stdin (AFTER npx muxed info)

# Discovery commands (use these to find tools)
npx muxed servers                        # List all connected MCP servers
npx muxed tools [server]                 # List available tools (optionally filter by server)
npx muxed grep <pattern>                 # Search tool names and descriptions
npx muxed resources [server]             # List MCP resources
npx muxed read <server>/<resource>       # Read an MCP resource
\`\`\`

**CORRECT Usage Pattern:**

<example>
User: Please use the slack mcp tool to search for my mentions
Assistant: As a first step, I need to discover the tools I need. Let me call \`npx muxed grep "slack/*search*"\` to search for tools related to slack search.
[Calls npx muxed grep "slack/*search*"]
Assistant: I need to check the schema first. Let me call \`npx muxed info slack/search_private\` to see what parameters it accepts.
[Calls npx muxed info]
Assistant: Now I can see it accepts "query" and "max_results" parameters. Let me make the call.
[Calls npx muxed call slack/search_private with correct schema]
</example>

<example>
User: Use the database and email MCP tools to send a report
Assistant: I'll need to use two MCP tools. Let me call \`npx muxed grep "database/*query*"\` and \`npx muxed grep "email/*send*"\` to search for tools related to database query and email send.
[Calls npx muxed grep "database/*query*" & npx muxed grep "email/*send*"]
Assistant: Let me check both schemas first.
[Calls npx muxed info database/query and npx muxed info email/send in parallel]
Assistant: Now I have both schemas. Let me make the calls.
[Makes both npx muxed call commands with correct parameters]
</example>

<example>
User: Create a copy of this email
Assistant: Let me find the tool I need first.
[Calls npx muxed grep "email/*copy*". No results found.]
Assistant: Let me try another pattern.
[Calls npx muxed grep "email/*clone*". No results found.]
Assistant: Let me list all available tools in the server.
[Calls npx muxed tools email]
Assistant: Let me check the schema first.
[Calls npx muxed info email/duplicate]
Assistant: Now I have the schema. Let me make the call.
[Calls npx muxed call email/duplicate with correct parameters]
</example>

**INCORRECT Usage Patterns - NEVER DO THIS:**

<bad-example>
User: Please use the slack mcp tool to search for my mentions
Assistant: [Directly calls npx muxed call slack/search_private with guessed parameters]
WRONG - You must call npx muxed info FIRST
</bad-example>

<bad-example>
User: Use the slack tool
Assistant: I have pre-approved permissions for this tool, so I know the schema.
[Calls npx muxed call slack/search_private directly]
WRONG - Pre-approved permissions don't mean you know the schema. ALWAYS call npx muxed info first.
</bad-example>

<bad-example>
User: Search my Slack mentions
Assistant: [Calls three npx muxed call commands in parallel without any npx muxed info calls first]
WRONG - You must call npx muxed info for ALL tools before making ANY npx muxed call commands
</bad-example>

Example usage:
\`\`\`bash
# Discover tools
npx muxed tools                          # See all available MCP tools
npx muxed grep "weather"                 # Find tools by description

# Get tool details
npx muxed info <server>/<tool>           # View JSON schema for input and output if available

# Simple tool call (no parameters)
npx muxed call weather/get_location '{}'

# Tool call with parameters
npx muxed call database/query '{"table": "users", "limit": 10}'

# Complex JSON using stdin (for nested objects/arrays)
npx muxed call api/send_request - <<'EOF'
{
  "endpoint": "/data",
  "headers": {"Authorization": "Bearer token"},
  "body": {"items": [1, 2, 3]}
}
EOF
\`\`\`

Call the \`npx muxed -h\` to see all available commands.

Below are the instructions for the connected MCP servers in muxed.

${instructions}
`;

export function buildInstructions(servers: ServerState[]): string {
  const connected = servers.filter((s) => s.status === 'connected');

  const serverList = connected.map((s) => `- ${s.name}`).join('\n');

  const serverInstructions = connected
    .filter((s) => s.instructions)
    .map((s) => `### ${s.name}\n\n${s.instructions}`)
    .join('\n\n');

  return cliInstructions(serverList, serverInstructions).trim();
}
