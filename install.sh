#!/usr/bin/env bash
# Comet MCP — Team Install Script
# Sets up comet-mcp with all tools including Tab Groups extension
#
# Usage:
#   curl -fsSL <raw-url>/install.sh | bash
#   — or —
#   git clone <repo-url> && cd comet-mcp && bash install.sh

set -euo pipefail

# ---- Colors ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()   { echo -e "${RED}[ERR]${NC}   $1"; }

# ---- Pre-flight checks ----
echo ""
echo -e "${BOLD}Comet MCP Installer${NC}"
echo "==================="
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  err "Node.js is required (v18+). Install from https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  err "Node.js 18+ required (found v$(node -v))"
  exit 1
fi
ok "Node.js $(node -v)"

# Check npm
if ! command -v npm &>/dev/null; then
  err "npm is required"
  exit 1
fi
ok "npm $(npm -v)"

# ---- Determine install location ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# If we're already inside the comet-mcp directory (e.g., ran from cloned repo)
if [ -f "$SCRIPT_DIR/package.json" ] && grep -q '"comet-mcp"' "$SCRIPT_DIR/package.json" 2>/dev/null; then
  INSTALL_DIR="$SCRIPT_DIR"
  info "Running from existing repo: $INSTALL_DIR"
else
  # Default install location
  INSTALL_DIR="$HOME/comet-mcp"
  if [ -d "$INSTALL_DIR" ]; then
    info "Updating existing install at $INSTALL_DIR"
    cd "$INSTALL_DIR"
    git pull --ff-only 2>/dev/null || warn "Git pull failed — continuing with existing files"
  else
    info "Cloning comet-mcp to $INSTALL_DIR"
    git clone https://github.com/hanzili/comet-mcp.git "$INSTALL_DIR"
  fi
fi

cd "$INSTALL_DIR"

# ---- Install & Build ----
info "Installing dependencies..."
npm install --silent 2>&1 | tail -1
ok "Dependencies installed"

info "Building TypeScript..."
npm run build 2>&1 | tail -1
ok "Build complete"

# ---- Verify extension exists ----
if [ -f "$INSTALL_DIR/extension/manifest.json" ] && [ -f "$INSTALL_DIR/extension/background.js" ]; then
  ok "Tab Groups extension found at $INSTALL_DIR/extension/"
else
  warn "Extension files not found in $INSTALL_DIR/extension/"
  warn "Tab group features will not work without the extension"
fi

# ---- Verify build output ----
if [ -f "$INSTALL_DIR/dist/index.js" ]; then
  ok "MCP server binary: $INSTALL_DIR/dist/index.js"
else
  err "Build failed — dist/index.js not found"
  exit 1
fi

if [ -f "$INSTALL_DIR/dist/http-server.js" ]; then
  ok "HTTP bridge binary: $INSTALL_DIR/dist/http-server.js"
fi

# ---- Print setup instructions ----
echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  Installation Complete!${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""
echo -e "${BOLD}Step 1: Configure Claude Code${NC}"
echo ""
echo "  Add to ~/.claude.json (global) or .mcp.json (project):"
echo ""
echo -e "  ${CYAN}{"
echo '    "mcpServers": {'
echo '      "comet-bridge": {'
echo "        \"command\": \"node\","
echo "        \"args\": [\"$INSTALL_DIR/dist/index.js\"]"
echo '      }'
echo '    }'
echo -e "  }${NC}"
echo ""
echo -e "${BOLD}Step 2: Install Comet Browser${NC}"
echo ""
echo "  Download from: https://www.perplexity.ai/comet"
echo ""
echo -e "${BOLD}Step 3: Load Tab Groups Extension (optional)${NC}"
echo ""
echo "  1. Open Comet browser"
echo "  2. Go to comet://extensions"
echo "  3. Enable 'Developer mode' (top-right toggle)"
echo "  4. Click 'Load unpacked'"
echo "  5. Select: $INSTALL_DIR/extension/"
echo ""
echo -e "${BOLD}Step 4: Start HTTP Bridge (optional, for Cowork)${NC}"
echo ""
echo "  cd $INSTALL_DIR && npm run http"
echo "  → Starts REST API on http://localhost:3456"
echo ""
echo -e "${BOLD}Quick Test:${NC}"
echo ""
echo "  # In Claude Code, try:"
echo '  "Use Comet to search for the latest AI news"'
echo ""
echo -e "${GREEN}Done!${NC} Restart Claude Code to pick up the new MCP server."
echo ""
