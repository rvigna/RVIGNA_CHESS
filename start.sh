#!/bin/bash

# Chess App Starter

echo "Starting Chess server..."
node server.js &
SERVER_PID=$!

sleep 2

echo ""
echo "✓ Server running on http://localhost:3000"
echo ""
echo "Opening in browser..."
open http://localhost:3000 2>/dev/null || echo "Please open http://localhost:3000 in your browser"

echo ""
echo "Press Ctrl+C to stop the server"
wait $SERVER_PID
