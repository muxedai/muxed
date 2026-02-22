import { defineBuildConfig } from 'obuild/config';

export default defineBuildConfig({
  entries: [
    { type: 'bundle', input: './src/cli.ts', dts: false },
    { type: 'bundle', input: './src/client/index.ts', dts: true },
  ],
});
