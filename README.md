# baseinterface-appmain

Cross-platform mobile app template homepage SOT for reusable UI components and multimodal editing entry.

**Domain:** cross-platform-mobile-app-template

## Current Status

- Repository initialization is complete (no `init/` directory).
- Frontend app is implemented in `apps/frontend` (Expo Router + reusable UI components).
- Backend/API modules are not implemented in this repo yet.
- Governance and LLM context contracts are enabled under `.ai/` and `docs/context/`.

## Tech Stack

| Category | Technology |
|----------|------------|
| Language | react-native |
| Package Manager | pnpm |
| Layout | monorepo |
| Frontend | react-native-expo |

| Database | postgres |

| API | none |

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd baseinterface-appmain

# Install dependencies
pnpm install
```

### Development

```bash
# Start the frontend dev server
pnpm dev

# Optional targets
pnpm --filter @baseinterface/frontend ios
pnpm --filter @baseinterface/frontend android
pnpm --filter @baseinterface/frontend web

# Type checks
pnpm typecheck
pnpm --filter @baseinterface/frontend typecheck
```

## Project Structure

```
apps/
  frontend/        # Expo React Native app (main product surface)
packages/
  shared/          # Shared package placeholder
.ai/               # Skills (SSOT), governance scripts, LLM config
dev-docs/          # Long-running task bundles
docs/context/      # LLM-readable contracts (API/DB/process/UI)
ui/                # UI tokens/contract/patterns
ops/               # Ops conventions (packaging/deploy)
```

## Skills & AI Assistance

This project uses the AI-Friendly Repository pattern:

- **SSOT Skills**: `.ai/skills/` - Edit skills here only
- **Generated Wrappers**: `.codex/skills/`, `.claude/skills/` - Do NOT edit directly

Regenerate wrappers after skill changes:

```bash
node .ai/scripts/sync-skills.mjs --scope current --providers both --mode reset --yes
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Run checks:
   - `pnpm typecheck`
   - `pnpm --filter @baseinterface/frontend lint`
4. Submit a pull request

## License

[Add your license here]
