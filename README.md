# baseinterface-appmain

Cross-platform mobile app template homepage SOT for reusable UI components and multimodal editing entry.

**Domain:** cross-platform-mobile-app-template

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
pnpm dev
```

## Project Structure

```
apps/
  frontend/        # Frontend application
  backend/         # Backend services
packages/
  shared/          # Shared libraries
.ai/skills/        # AI skills (SSOT)
docs/              # Documentation
ops/               # DevOps configuration
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
3. Run tests: `pnpm test`
4. Submit a pull request

## License

[Add your license here]
