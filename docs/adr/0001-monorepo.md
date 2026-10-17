# 1. One TypeScript monorepo for all clients and the API

- Status: accepted
- Date: 2026-10-17

## Context

ProjectZero ships mobile, web and desktop clients. All of them talk to one backend API and one Postgres database.

## Decision

Keep everything in a single pnpm + Turborepo monorepo:

- Expo (mobile), Next.js (web) and Electron (desktop)
- a NestJS API
- shared packages for zod schemas, the database, auth, the agent, the generated API client, and UI

## Consequences

- A change to the API contract and the client changes that go with it land in one commit. The type checker catches any drift.
- No internal packages need to be versioned or published.
- CI must use Turborepo caching and filtering to stay fast as the repo grows.
