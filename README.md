# ProjectZero

Monorepo for the ProjectZero mobile (Expo), web (Next.js) and desktop (Electron) apps, which all use one NestJS API and one Postgres database.

## Getting started

```sh
cp .env.example .env
docker compose up -d
pnpm install
pnpm dev
```

## Conventions

- **Commits** follow [Conventional Commits](https://www.conventionalcommits.org). The scope must be a workspace package name (`feat(api): …`) or one of `repo`, `deps`, `ci`, `docs`, `release`. The `commit-msg` hook enforces this.
- **Worktrees:** each increment of work lives in its own git worktree with its own ports and database:

  ```sh
  pnpm wt new web          # ../project0.worktrees/web on feat/web
  pnpm wt ls
  pnpm wt rm web
  ```

- **Decisions** are recorded in [`docs/adr`](docs/adr).
