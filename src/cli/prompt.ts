import * as readline from 'node:readline/promises';

type PromptOpts = {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
};

export async function confirm(message: string, opts?: PromptOpts): Promise<boolean> {
  const rl = readline.createInterface({
    input: (opts?.input ?? process.stdin) as NodeJS.ReadableStream,
    output: (opts?.output ?? process.stdout) as NodeJS.WritableStream,
  });

  try {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

export async function choose<T>(
  message: string,
  options: Array<{ label: string; value: T }>,
  opts?: PromptOpts
): Promise<T> {
  const output = (opts?.output ?? process.stdout) as NodeJS.WritableStream;
  const rl = readline.createInterface({
    input: (opts?.input ?? process.stdin) as NodeJS.ReadableStream,
    output,
  });

  try {
    output.write(`${message}\n`);
    for (let i = 0; i < options.length; i++) {
      output.write(`  ${i + 1}) ${options[i]!.label}\n`);
    }

    while (true) {
      const answer = await rl.question(`Choice [1-${options.length}]: `);
      const index = parseInt(answer.trim(), 10) - 1;
      if (index >= 0 && index < options.length) {
        return options[index]!.value;
      }
      output.write(`Invalid choice. Enter a number between 1 and ${options.length}.\n`);
    }
  } finally {
    rl.close();
  }
}
