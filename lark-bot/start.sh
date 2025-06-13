#!/bin/bash

echo "🤖 Starting PM-Next Lark Bot..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please run 'node setup.js' first."
    exit 1
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the bot
echo "🚀 Launching bot server..."
npm start
