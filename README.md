# Stellar Garden

An interactive starry night sky SPA rendered with Canvas API.

## Features

- Three star layers (far, mid, near) for depth perception
- Horizontal drift simulating diurnal motion
- Mouse-driven parallax effect
- Twinkling, glow, and varied star color temperatures
- Zero external dependencies (Canvas API only)

## Tech Stack

- React / TypeScript / Vite
- Cloudflare Workers Static Assets (hosting)

## Development

```bash
pnpm install
pnpm run dev
```

## Deploy

```bash
pnpm run deploy
```

## Tooling

CLI tools (`lefthook`) are managed by [aqua](https://aquaproj.github.io/) with versions pinned in [aqua.yaml](aqua.yaml).

### Install tools

Install aqua itself first (see the [aqua installation guide](https://aquaproj.github.io/docs/install)), then install the pinned tools:

```bash
aqua install
```

### Set up git hooks

[lefthook](lefthook.yml) runs lint and format checks on staged files before each commit. Register the hooks once after cloning:

```bash
lefthook install
```
