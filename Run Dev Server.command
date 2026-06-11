#!/bin/bash
cd "$(dirname "$0")"

# Trap exit signals to kill background jobs
trap 'kill $(jobs -p) 2>/dev/null' EXIT SIGINT SIGTERM

echo "Starting backend server..."
cd backend
node server.js &

echo "Starting frontend dev server..."
cd ../frontend
npm run dev
