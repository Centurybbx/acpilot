# Repository Guidelines

## Project Structure & Module Organization
`acpilot` is a pnpm workspace with three packages under `packages/`:

- `packages/web`: React 19 + Vite frontend. Main code lives in `src/`, shared test setup is in `src/test/`.
- `packages/daemon`: Fastify + WebSocket backend. Runtime code is in `src/`, tests are in `__tests__/`.
- `packages/shared`: shared TypeScript types and constants consumed by both apps.

Design notes live in `docs/`, and screenshots/assets live in `imgs/`. Prefer editing `.ts` / `.tsx` sources, not generated outputs in `dist/`.

## Build, Test, and Development Commands
- `pnpm install`: install workspace dependencies.
- `pnpm dev`: run all package dev scripts in parallel.
- `pnpm build`: build every package in dependency order.
- `pnpm test`: run all Vitest suites.
- `pnpm --filter @acpilot/web dev`: start the web app locally.
- `pnpm --filter @acpilot/daemon dev`: start the daemon with `tsx watch`.
- `pnpm --filter @acpilot/web exec vite --host 0.0.0.0 --port 5173 --strictPort`: expose the web dev server for phone testing over Tailscale.

## Coding Style & Naming Conventions
Use TypeScript with ES modules and 2-space indentation. Match the existing style: single quotes, semicolons, named exports for shared utilities, PascalCase for React components (`AppShell.tsx`), and camelCase for hooks, stores, and helpers (`useWebSocket.ts`, `connection.ts`).

## Testing Guidelines
Vitest is the test runner across the workspace. Web tests run in `jsdom`; daemon tests run in `node` and are discovered from `packages/daemon/__tests__/**/*.test.ts`.

Name tests `*.test.ts` or `*.test.tsx`. Put backend behavior tests in `packages/daemon/__tests__/`, and keep frontend tests near the app code. Run `pnpm test` before opening a PR; use package filters for focused runs.

## Commit & Pull Request Guidelines
Keep commits small and imperative. Current history uses concise prefixes such as `chore:` plus plain-language reverts, so follow that pattern when it fits, for example `feat: add websocket reconnect guard`.

PRs should include a short summary, affected package(s), test coverage notes, and screenshots for visible web changes. Link the related issue or design doc when applicable.

## Configuration & Security Tips
Do not commit local secrets. The daemon prints an initial token at startup; use it only for local sessions. Override agent command paths with environment variables such as `ACPILOT_CODEX_COMMAND` or `ACPILOT_COPILOT_COMMAND` when local tooling differs from the default setup.
