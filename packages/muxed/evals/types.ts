export type AgentType = 'claude-code' | 'codex';

export type Condition = 'baseline' | 'muxed';

export type CapturedToolCall = {
  name: string;
  arguments?: Record<string, unknown>;
  timestamp?: number;
  result?: unknown;
};

export type AgentRunResult = {
  agent: AgentType;
  condition: Condition;
  toolCalls: CapturedToolCall[];
  finalOutput: string;
  durationMs: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  exitCode: number;
  rawOutput: string;
};

export type EvalTask = {
  name: string;
  input: string;
  expected?: string;
  metadata?: Record<string, unknown>;
};

export type MockServerDef = {
  name: string;
  scriptPath: string;
  args?: string[];
  port?: number;
};

export type RunningServer = {
  name: string;
  port: number;
  process: import('node:child_process').ChildProcess;
  url: string;
};

export type ToolSweepConfig = {
  toolCount: number;
  taskIndex: number;
  correctTool: string;
};
