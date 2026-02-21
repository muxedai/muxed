# Contributing to mcpd

Thanks for your interest in contributing to mcpd! This document covers the basics for getting started.

## Development Setup

```bash
git clone https://github.com/skoob13/mcpd.git
cd mcpd
pnpm install
```

## Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run checks: `pnpm type-check && pnpm test && pnpm format:check`
5. Commit with a clear message
6. Open a pull request

## Code Style

The project uses Prettier for formatting. A pre-commit hook runs automatically via Husky + lint-staged. You can also run `pnpm format` manually.

## Project Structure

- `src/cli/` — CLI commands and client
- `src/daemon/` — Background daemon (socket server, process management)
- `src/core/` — Server management, config loading, types
- `src/utils/` — Path utilities, logging
- `specs/` — Design specifications

## Running Tests

```bash
pnpm test          # Run all tests
pnpm test -- --watch  # Watch mode
```

## Building

```bash
pnpm build         # Build with obuild
node bin/cli.mjs   # Run the built CLI
```

## Design Specs

Before making significant changes, review the relevant spec in `specs/`. The specs document the intended behavior and architecture decisions.

## Reporting Issues

Please include:
- mcpd version (`mcpd --version`)
- Node.js version (`node --version`)
- OS and architecture
- Steps to reproduce
- Expected vs actual behavior

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
