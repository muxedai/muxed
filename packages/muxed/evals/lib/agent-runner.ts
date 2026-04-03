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
  mcpConfigPath: string;
  workDir: string;
  apiKeys: Record<string, string>;
  maxTurns?: number;
  maxBudgetUsd?: number;
  timeoutMs?: number;
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
 */
export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const {
    agent,
    condition,
    taskPrompt,
    mcpConfigPath,
    workDir,
    apiKeys,
    maxTurns = 20,
    maxBudgetUsd = 2.0,
    timeoutMs = 300_000,
  } = opts;

  const imageName = await ensureImage(agent);
  const startTime = Date.now();

  // Build environment variables
  const env: string[] = Object.entries(apiKeys).map(([k, v]) => `${k}=${v}`);

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
    ];

    // Add MCP config if it's a .mcp.json in the workdir
    if (fs.existsSync(mcpConfigPath)) {
      cmd.push('--mcp-config', '/workspace/.mcp.json');
    }
  } else {
    cmd = ['exec', '--full-auto', '--json', '--skip-git-repo-check', '--ephemeral', taskPrompt];
  }

  // Create and start the container
  const container = await docker.createContainer({
    Image: imageName,
    Cmd: cmd,
    Env: env,
    HostConfig: {
      Binds: [
        `${path.resolve(workDir)}:/workspace:ro`,
        `${path.resolve(path.dirname(mcpConfigPath))}:/workspace-config:ro`,
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

    return {
      agent,
      condition,
      toolCalls,
      finalOutput,
      durationMs,
      tokenUsage,
      exitCode,
      rawOutput,
    };
  } finally {
    // Clean up container
    try {
      await container.remove({ force: true });
    } catch {
      // Container may have already been removed
    }
  }
}
