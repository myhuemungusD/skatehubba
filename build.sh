#!/bin/bash
set -e

echo "Building SkateHubba for production..."

# Install dependencies using pnpm with frozen lockfile for reproducible builds
echo "Installing dependencies..."
pnpm install --frozen-lockfile

# Build both client and server via turbo
echo "Building application..."
pnpm run build

echo "Build completed successfully!"
echo "Client assets: dist/public/"
echo "Server bundle: dist/server/"
echo "Ready to start with: NODE_ENV=production node dist/server/index.js"