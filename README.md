<div align="center" width="100%">
    <img src="./frontend/public/icon.svg" width="128" alt="" />
</div>

# Dockge (TeeJS fork)

A fork of [Dockge](https://github.com/louislam/dockge) by [@louislam](https://github.com/louislam), built on [hamphh/dockge](https://github.com/hamphh/dockge).

For general information about Dockge, see the original project. For the features hamphh added (container control buttons, resource stats, agent names, theme options and more), see [hamphh's release notes](https://github.com/hamphh/dockge/releases).

## What this fork adds

On top of hamphh/dockge:

- **CodeMirror compose editor** grafted in from upstream.
- **Image update check works out of the box.** The image includes `skopeo`, which the update check needs. Private registries still need credentials mounted into the container.
- **Prune by default on update.** The Update dialog starts with "Prune dangling images" and "Also all unused images" ticked. Untick them for a single update if you want to keep unused images.
- **Fixes:**
  - Stack names are checked before they are used as paths, so a name like `../outside` can't reach outside the stacks directory (from upstream [#997](https://github.com/louislam/dockge/pull/997)).
  - The web Console sets `TERM`, so `clear`, Ctrl+L and colors work (from upstream [#1012](https://github.com/louislam/dockge/pull/1012)).
  - No more `spawn docker ENOENT` log spam for compose projects whose folder isn't mounted into Dockge.
  - Removed a duplicate database migration that crashed on startup.

## Usage

In your Dockge compose file, replace the image:

```yaml
services:
  dockge:
    image: ghcr.io/teejs/dockge:latest
```

Use the same image on every endpoint (agent).

⚠️ **Back up your Dockge data folder first** (`./data`, mounted at `/app/data`). This image changes the database, so going back to the upstream image means restoring that backup.

To update later:

```bash
docker compose pull && docker compose up -d
```

The image is built for **linux/amd64** only.

## Images and CI

| Workflow | When | What it does |
|---|---|---|
| Build Fork Image (`build-fork.yml`) | Push to `master`, or run manually | Builds and pushes `ghcr.io/teejs/dockge:latest` and `:test` |
| Node.js CI (`ci.yml`) | Pull requests and pushes to `master` | Lint, TypeScript check and frontend build, on Ubuntu |
| Upstream Sync Check (`upstream-sync-check.yml`) | Mondays 06:00 UTC | Opens or updates an issue listing louislam/dockge commits not yet in this fork, and closes it once caught up |

Upstream changes are never merged automatically. Merges into this fork have caused silent bugs before (duplicate socket handlers, a migration collision), so each sync is reviewed by hand.

## License

MIT, same as upstream. See [LICENSE](LICENSE).
