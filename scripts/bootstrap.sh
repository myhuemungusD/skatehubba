#!/bin/bash
set -e

echo "🛹 SkateHubba Monorepo Bootstrap"
echo "================================"

if ! command -v pnpm &> /dev/null; then
    echo "⚠️  pnpm not found. Installing via corepack..."
    corepack enable
    corepack prepare pnpm@latest --activate
fi

echo ""
echo "📦 Installing root dependencies..."
pnpm i --frozen-lockfile

echo ""
echo "📱 Installing mobile dependencies..."
cd mobile && pnpm i --frozen-lockfile && cd ..

if [ -d "infra/firebase/functions" ]; then
    echo ""
    echo "☁️  Installing Firebase Functions dependencies..."
    cd infra/firebase/functions && pnpm i --frozen-lockfile && cd ../../..
fi

echo ""
echo "✅ All dependencies installed with pnpm --frozen-lockfile"
echo ""
echo "🚀 Ready to develop! Run: pnpm run dev"
