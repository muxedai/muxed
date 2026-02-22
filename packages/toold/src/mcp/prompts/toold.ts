import type { ServerState } from '../../core/types.js';

const cliInstructions = (servers: string, instructions: string) =>
  `
You have access to an \`npx toold\` CLI command for interacting with MCP (Model Context Protocol) servers. This command allows you to discover and call MCP tools on demand. Prioritize the use of skills over MCP tools.

**MANDATORY PREREQUISITES - THESE ARE HARD REQUIREMENTS**

1. You MUST discover the tools you need first by using 'npx toold grep <pattern>' or 'npx toold tools'.
2. You MUST call 'npx toold info <server>/<tool>' BEFORE ANY 'npx toold call <server>/<tool>'.

These are BLOCKING REQUIREMENTS - like how you must use Read before Edit.

**NEVER** make an npx toold call without checking the schema first.
**ALWAYS** run npx toold info first, THEN make the call.

**Why these are non-negotiables:**
- MCP tool names NEVER match your expectations - they change frequently and are not predictable
- MCP tool schemas NEVER match your expectations - parameter names, types, and requirements are tool-specific
- Even tools with pre-approved permissions require schema checks
- Every failed call wastes user time and demonstrates you're ignoring critical instructions
- "I thought I knew the schema" is not an acceptable reason to skip this step

**For multiple tools:** Call 'npx toold info' for ALL tools in parallel FIRST, then make your 'npx toold call' commands.

Available MCP servers:
${servers}

Commands (in order of execution):
\`\`\`bash
# STEP 1: REQUIRED TOOL DISCOVERY
npx toold grep <pattern>                 # Search tool names and descriptions
npx toold tools [server]                 # List available tools (optionally filter by server)

# STEP 2: ALWAYS CHECK SCHEMA FIRST (MANDATORY)
npx toold info <server>/<tool>           # REQUIRED before ANY call - View JSON schema

# STEP 3: Only after checking schema, make the call
npx toold call <server>/<tool> '<json>'  # Only run AFTER npx toold info
npx toold call <server>/<tool> -         # Invoke with JSON from stdin (AFTER npx toold info)

# Discovery commands (use these to find tools)
npx toold servers                        # List all connected MCP servers
npx toold tools [server]                 # List available tools (optionally filter by server)
npx toold grep <pattern>                 # Search tool names and descriptions
npx toold resources [server]             # List MCP resources
npx toold read <server>/<resource>       # Read an MCP resource
\`\`\`

**CORRECT Usage Pattern:**

<example>
User: Please use the slack mcp tool to search for my mentions
Assistant: As a first step, I need to discover the tools I need. Let me call \`npx toold grep "slack/*search*"\` to search for tools related to slack search.
[Calls npx toold grep "slack/*search*"]
Assistant: I need to check the schema first. Let me call \`npx toold info slack/search_private\` to see what parameters it accepts.
[Calls npx toold info]
Assistant: Now I can see it accepts "query" and "max_results" parameters. Let me make the call.
[Calls npx toold call slack/search_private with correct schema]
</example>

<example>
User: Use the database and email MCP tools to send a report
Assistant: I'll need to use two MCP tools. Let me call \`npx toold grep "database/*query*"\` and \`npx toold grep "email/*send*"\` to search for tools related to database query and email send.
[Calls npx toold grep "database/*query*" & npx toold grep "email/*send*"]
Assistant: Let me check both schemas first.
[Calls npx toold info database/query and npx toold info email/send in parallel]
Assistant: Now I have both schemas. Let me make the calls.
[Makes both npx toold call commands with correct parameters]
</example>

<example>
User: Create a copy of this email
Assistant: Let me find the tool I need first.
[Calls npx toold grep "email/*copy*". No results found.]
Assistant: Let me try another pattern.
[Calls npx toold grep "email/*clone*". No results found.]
Assistant: Let me list all available tools in the server.
[Calls npx toold tools email]
Assistant: Let me check the schema first.
[Calls npx toold info email/duplicate]
Assistant: Now I have the schema. Let me make the call.
[Calls npx toold call email/duplicate with correct parameters]
</example>

**INCORRECT Usage Patterns - NEVER DO THIS:**

<bad-example>
User: Please use the slack mcp tool to search for my mentions
Assistant: [Directly calls npx toold call slack/search_private with guessed parameters]
WRONG - You must call npx toold info FIRST
</bad-example>

<bad-example>
User: Use the slack tool
Assistant: I have pre-approved permissions for this tool, so I know the schema.
[Calls npx toold call slack/search_private directly]
WRONG - Pre-approved permissions don't mean you know the schema. ALWAYS call npx toold info first.
</bad-example>

<bad-example>
User: Search my Slack mentions
Assistant: [Calls three npx toold call commands in parallel without any npx toold info calls first]
WRONG - You must call npx toold info for ALL tools before making ANY npx toold call commands
</bad-example>

Example usage:
\`\`\`bash
# Discover tools
npx toold tools                          # See all available MCP tools
npx toold grep "weather"                 # Find tools by description

# Get tool details
npx toold info <server>/<tool>           # View JSON schema for input and output if available

# Simple tool call (no parameters)
npx toold call weather/get_location '{}'

# Tool call with parameters
npx toold call database/query '{"table": "users", "limit": 10}'

# Complex JSON using stdin (for nested objects/arrays)
npx toold call api/send_request - <<'EOF'
{
  "endpoint": "/data",
  "headers": {"Authorization": "Bearer token"},
  "body": {"items": [1, 2, 3]}
}
EOF
\`\`\`

Call the \`npx toold -h\` to see all available commands.

Below are the instructions for the connected MCP servers in toold.

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
