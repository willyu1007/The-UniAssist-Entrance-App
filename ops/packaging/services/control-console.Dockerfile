FROM node:22-alpine

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY ui ./ui

RUN pnpm install --frozen-lockfile

EXPOSE 4174

CMD ["pnpm", "--filter", "@uniassist/control-console", "dev", "--", "--host", "0.0.0.0", "--port", "4174"]
