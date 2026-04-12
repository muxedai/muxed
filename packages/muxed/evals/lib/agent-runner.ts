import Dockerode from 'dockerode';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import fs from 'node:fs';
import type { AgentType, Condition, AgentRunResult } from '../types.ts';
import {
  parseToolCalls,
  extractMuxedSubcommands,
  extractFinalOutput,
  extractTokenUsage,
  extractCostUsd,
} from './log-parser.ts';

function getDockerSocketPath(): string | undefined {
  const candidates = [
    process.env['DOCKER_HOST'],
    '/var/run/docker.sock',
    `${process.env['HOME']}/.orbstack/run/docker.sock`,
    `${process.env['HOME']}/.docker/run/docker.sock`,
    `${process.env['HOME']}/.colima/default/docker.sock`,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const p = c.replace(/^unix:\/\//, '');
    try {
      fs.accessSync(p);
      return p;
    } catch {}
  }
  return undefined;
}

const socketPath = getDockerSocketPath();
const docker = socketPath ? new Dockerode({ socketPath }) : new Dockerode();

const IMAGE_NAMES: Record<AgentType, string> = {
  'claude-code': 'muxed-eval-claude-code',
  codex: 'muxed-eval-codex',
};

export type AgentRunOptions = {
  agent: AgentType;
  condition: Condition;
  taskPrompt: string;
  workDir: string;
  apiKeys: Record<string, string>;
  maxTurns?: number;
  maxBudgetUsd?: number;
  timeoutMs?: number;
  keepContainer?: boolean;
};

/**
 * Build the Docker image if it doesn't exist.
 */
async function ensureImage(agent: AgentType): Promise<string> {
  const imageName = IMAGE_NAMES[agent];
  const dockerfilePath = path.resolve('evals/docker', `Dockerfile.${agent}`);

  // Check if image exists
  try {
    await docker.getImage(imageName).inspect();
    return imageName;
  } catch {
    // Image doesn't exist, build it
  }

  const contextDir = path.dirname(dockerfilePath);
  const stream = await docker.buildImage(
    {
      context: contextDir,
      src: [path.basename(dockerfilePath)],
    },
    {
      t: imageName,
      dockerfile: path.basename(dockerfilePath),
    }
  );

  // Wait for build to complete
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return imageName;
}

/**
 * Run an agent in a Docker container and capture the output.
 *
 * The workDir must contain pre-built config files for each condition:
 *   - baseline.mcp.json / muxed.mcp.json  (Claude Code MCP config)
 *   - .codex/baseline.config.toml / .codex/muxed.config.toml  (Codex MCP config)
 *   - muxed.config.json  (muxed daemon server list, used in muxed condition)
 */
export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const {
    agent,
    condition,
    taskPrompt,
    workDir,
    apiKeys,
    maxTurns = 20,
    maxBudgetUsd = 2.0,
    timeoutMs = 300_000,
    keepContainer = false,
  } = opts;

  const imageName = await ensureImage(agent);
  const startTime = Date.now();

  // Build environment variables
  const env: string[] = Object.entries(apiKeys).map(([k, v]) => `${k}=${v}`);

  // Resolve condition-specific config paths
  // Baseline: agents connect to MCP servers directly via .mcp.json / config.toml, no CLAUDE.md/AGENTS.md
  // Muxed: agents use `npx muxed` CLI (instructions in CLAUDE.md/AGENTS.md), no direct MCP
  const mcpJsonPath = path.resolve(workDir, '.mcp.json');
  const codexConfigPath = path.resolve(workDir, `.codex/${condition}.config.toml`);
  const muxedConfigPath = path.resolve(workDir, 'muxed.config.json');
  const muxedClaudeMdPath = path.resolve(workDir, 'muxed.CLAUDE.md');
  const muxedAgentsMdPath = path.resolve(workDir, 'muxed.AGENTS.md');

  // Build command based on agent
  let cmd: string[];
  if (agent === 'claude-code') {
    cmd = [
      '-p',
      taskPrompt,
      '--output-format',
      'stream-json',
      '--verbose',
      '--dangerously-skip-permissions',
      '--max-turns',
      String(maxTurns),
      // Baseline: connect to MCP servers directly via config
      // Muxed: no MCP config — agent uses npx muxed CLI via bash
      ...(condition === 'baseline' ? ['--mcp-config', '/workspace/.mcp.json'] : []),
    ];
  } else {
    // Codex requires login before exec — pipe OPENAI_API_KEY via stdin
    // Use --dangerously-bypass-approvals-and-sandbox since Docker doesn't support bubblewrap
    cmd = [
      '-c',
      `echo "$OPENAI_API_KEY" | codex login --with-api-key && codex exec --dangerously-bypass-approvals-and-sandbox --json --skip-git-repo-check --ephemeral "${taskPrompt.replace(/"/g, '\\"')}"`,
    ];
  }

  // Create and start the container
  const container = await docker.createContainer({
    Image: imageName,
    Cmd: cmd,
    Env: env,
    // Codex needs bash entrypoint to run login + exec
    ...(agent !== 'claude-code' && { Entrypoint: ['bash'] }),
    HostConfig: {
      Binds: [
        // Mount workspace read-write so file overlays work
        `${path.resolve(workDir)}:/workspace`,
        // Always overlay Codex config.toml (baseline has servers, muxed has empty)
        ...(fs.existsSync(codexConfigPath)
          ? [`${codexConfigPath}:/home/agent/.codex/config.toml`]
          : []),
        // Baseline: overlay direct MCP config for Claude Code
        ...(condition === 'baseline' ? [`${mcpJsonPath}:/workspace/.mcp.json:ro`] : []),
        // Muxed: mount muxed.config.json + CLAUDE.md/AGENTS.md with muxed instructions
        ...(condition === 'muxed'
          ? [
              ...(fs.existsSync(muxedConfigPath)
                ? [`${muxedConfigPath}:/workspace/muxed.config.json:ro`]
                : []),
              ...(fs.existsSync(muxedClaudeMdPath)
                ? [`${muxedClaudeMdPath}:/workspace/CLAUDE.md:ro`]
                : []),
              ...(fs.existsSync(muxedAgentsMdPath)
                ? [`${muxedAgentsMdPath}:/workspace/AGENTS.md:ro`]
                : []),
            ]
          : []),
      ],
      NetworkMode: process.platform === 'linux' ? 'host' : 'bridge',
      // Add host.docker.internal on macOS Docker Desktop
      ...(process.platform !== 'linux' && {
        ExtraHosts: ['host.docker.internal:host-gateway'],
      }),
    },
    WorkingDir: '/workspace',
    AttachStdout: true,
    AttachStderr: true,
  });

  let rawOutput = '';
  let rawStderr = '';

  try {
    // Attach to capture output
    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });

    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();
    const outputChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    stdoutStream.on('data', (chunk: Buffer) => outputChunks.push(chunk));
    stderrStream.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    // Demux stdout and stderr
    docker.modem.demuxStream(stream, stdoutStream, stderrStream);

    await container.start();

    // Wait for completion with timeout
    const waitPromise = container.wait();
    const timeoutPromise = new Promise<{ StatusCode: number }>((_, reject) =>
      setTimeout(() => reject(new Error('Agent timed out')), timeoutMs)
    );

    let exitCode: number;
    try {
      const result = await Promise.race([waitPromise, timeoutPromise]);
      exitCode = result.StatusCode;
    } catch (err) {
      // Timeout - kill the container
      try {
        await container.kill();
      } catch {
        // Container may have already exited
      }
      exitCode = 124; // timeout exit code
    }

    // Give a moment for stream buffers to flush
    await new Promise((r) => setTimeout(r, 500));

    rawOutput = Buffer.concat(outputChunks).toString('utf-8');
    rawStderr = Buffer.concat(stderrChunks).toString('utf-8');

    const durationMs = Date.now() - startTime;

    // Parse tool calls from output
    let toolCalls = parseToolCalls(rawOutput, agent);
    if (condition === 'muxed') {
      toolCalls = extractMuxedSubcommands(toolCalls);
    }

    const finalOutput = extractFinalOutput(rawOutput, agent);
    const tokenUsage = extractTokenUsage(rawOutput, agent);
    const costUsd = extractCostUsd(rawOutput, agent);

    return {
      agent,
      condition,
      toolCalls,
      finalOutput,
      durationMs,
      tokenUsage,
      costUsd,
      exitCode,
      rawOutput,
    };
  } finally {
    if (!keepContainer) {
      try {
        await container.remove({ force: true });
      } catch {
        // Container may have already been removed
      }
    }
  }
}
