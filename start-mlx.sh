#!/usr/bin/env bash
# Start the local MLX server (OpenAI-compatible) for OIPulse Strength Alert.
#
# Usage: ./start-mlx.sh [model] [port]
#   model  default: mlx-community/Qwen3-14B-4bit
#   port   default: 8080

set -euo pipefail

MODEL="${1:-mlx-community/Qwen3-14B-4bit}"
PORT="${2:-8080}"
VENV="$HOME/.mlx-oipulse/venv"

if [[ ! -x "$VENV/bin/mlx_lm.server" ]]; then
  echo "MLX not installed. Create the venv and install mlx-lm:"
  echo "  python3 -m venv \"$HOME/.mlx-oipulse/venv\""
  echo "  \"$HOME/.mlx-oipulse/venv/bin/python\" -m pip install -U mlx-lm"
  exit 1
fi

echo "Starting MLX server: model=$MODEL port=$PORT"
# Lower default temp + higher max-tokens help accuracy when Qwen3 reasoning is on.
exec "$VENV/bin/mlx_lm.server" \
  --model "$MODEL" \
  --port "$PORT" \
  --host 127.0.0.1 \
  --temp 0.2 \
  --top-p 0.9 \
  --max-tokens 6000 \
  --log-level INFO
