# Agents

## Code

- Always use Effect for everything: state, async work, resources, errors,
  streams and services. Reach for the Effect module (`Array`, `Option`,
  `Stream`, `Schema` and so on) before a native or third-party alternative.

## Finishing work

- When a change is done, always commit it on a branch and open a PR against
  `main`. Don't stop at uncommitted changes or a local branch.
- Before opening the PR, run `bun run check`, `bun run test` and
  `bun run build`, and say in the PR body what you checked.
- Don't merge the PR unless asked. `main` deploys to Cloudflare.
