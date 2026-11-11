#!/bin/bash
# =============================================================================
# SafeOS Guardian - Linode Server Setup Script
# =============================================================================
#
# This script sets up a fresh Linode server for SafeOS Guardian deployment.
#
# Requirements:
# - Fresh Ubuntu 22.04 LTS or Debian 12 Linode instance
# - Root or sudo access
# - Domain pointed to Linode IP (for automatic HTTPS)
#
# Recommended Linode Specs:
# - Linode 8GB ($48/mo) - Good for Moondream
# - Linode 16GB ($96/mo) - Better for LLaVA 7B
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/framerslab/safeos/master/scripts/linode-setup.sh | bash
#
#   OR manually:
#   wget https://raw.githubusercontent.com/framerslab/safeos/master/scripts/linode-setup.sh
#   chmod +x linode-setup.sh
#   ./linode-setup.sh
#
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Configuration
# =============================================================================

SAFEOS_DIR="/opt/safeos"
SAFEOS_REPO="https://github.com/framerslab/safeos.git"
SAFEOS_BRANCH="${SAFEOS_BRANCH:-master}"

# =============================================================================
# Pre-flight Checks
# =============================================================================

log_info "Starting SafeOS Guardian setup..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root or with sudo"
    exit 1
fi

# Check memory
TOTAL_MEM=$(grep MemTotal /proc/meminfo | awk '{print $2}')
TOTAL_MEM_GB=$((TOTAL_MEM / 1024 / 1024))
log_info "Detected ${TOTAL_MEM_GB}GB RAM"

if [ "$TOTAL_MEM_GB" -lt 4 ]; then
    log_warn "Less than 4GB RAM detected. Ollama may struggle with larger models."
fi

# =============================================================================
# System Updates
# =============================================================================

log_info "Updating system packages..."
apt-get update && apt-get upgrade -y

# =============================================================================
# Install Docker
# =============================================================================

if ! command -v docker &> /dev/null; then
    log_info "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log_success "Docker installed"
else
    log_info "Docker already installed"
fi

# Add current user to docker group if not root
if [ "$SUDO_USER" ]; then
    usermod -aG docker "$SUDO_USER"
    log_info "Added $SUDO_USER to docker group"
fi

# =============================================================================
# Install Docker Compose Plugin
# =============================================================================

if ! docker compose version &> /dev/null; then
    log_info "Installing Docker Compose plugin..."
    apt-get install -y docker-compose-plugin
    log_success "Docker Compose installed"
else
    log_info "Docker Compose already installed"
fi

# =============================================================================
# Install Additional Tools
# =============================================================================

log_info "Installing additional tools..."
apt-get install -y git curl wget htop unzip

# =============================================================================
# Configure Firewall
# =============================================================================

log_info "Configuring firewall..."
apt-get install -y ufw

ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp   # HTTP (Caddy redirect)
ufw allow 443/tcp  # HTTPS (Caddy)

# Don't enable automatically - user should verify SSH access first
log_warn "Firewall configured but NOT enabled. Run 'ufw enable' after verifying SSH access."

# =============================================================================
# Create SafeOS Directory
# =============================================================================

log_info "Setting up SafeOS directory..."
mkdir -p "$SAFEOS_DIR"
cd "$SAFEOS_DIR"

# =============================================================================
# Clone Repository (or download files)
# =============================================================================

if [ -d "$SAFEOS_DIR/.git" ]; then
    log_info "Updating existing repository..."
    git pull origin "$SAFEOS_BRANCH"
else
    log_info "Cloning SafeOS repository..."
    git clone --branch "$SAFEOS_BRANCH" --single-branch "$SAFEOS_REPO" .
fi

# If cloned from standalone repo, we're already in the right place

# =============================================================================
# Environment Configuration
# =============================================================================

log_info "Creating environment configuration..."

if [ ! -f ".env" ]; then
    cp .env.production .env 2>/dev/null || cat > .env << 'EOF'
# SafeOS Guardian - Production Environment Configuration
# Generated by linode-setup.sh

# =============================================================================
# Server Configuration
# =============================================================================
NODE_ENV=production

# Domain for Caddy HTTPS (replace with your domain)
SAFEOS_DOMAIN=safeos-api.yourdomain.com

# CORS origin for GitHub Pages frontend
CORS_ORIGIN=https://safeos.sh

# =============================================================================
# Ollama AI Configuration
# =============================================================================
OLLAMA_HOST=http://ollama:11434

# Default models to pull (space-separated)
OLLAMA_MODELS=moondream

# =============================================================================
# Notifications (Optional)
# =============================================================================

# Twilio SMS
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Telegram
TELEGRAM_BOT_TOKEN=

# Web Push VAPID Keys (generate with: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=

# =============================================================================
# Optional API Keys
# =============================================================================
OPENROUTER_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
EOF
    log_warn "Created .env file - PLEASE EDIT with your configuration:"
    log_warn "  nano $SAFEOS_DIR/.env"
fi

# =============================================================================
# Start Services
# =============================================================================

log_info "Starting SafeOS services..."
docker compose -f docker-compose.prod.yml up -d

# =============================================================================
# Pull Ollama Models
# =============================================================================

log_info "Waiting for Ollama to be ready..."
sleep 10

log_info "Pulling Ollama models (this may take a while)..."
docker exec safeos-ollama ollama pull moondream || log_warn "Failed to pull moondream model"

# Optionally pull LLaVA if enough memory
if [ "$TOTAL_MEM_GB" -ge 8 ]; then
    log_info "Pulling LLaVA model (8GB+ RAM detected)..."
    docker exec safeos-ollama ollama pull llava:7b || log_warn "Failed to pull llava:7b model"
fi

# =============================================================================
# Setup Complete
# =============================================================================

echo ""
echo "============================================================================="
log_success "SafeOS Guardian setup complete!"
echo "============================================================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Edit your configuration:"
echo "   nano $SAFEOS_DIR/.env"
echo ""
echo "2. Update SAFEOS_DOMAIN with your actual domain"
echo "3. Update CORS_ORIGIN with your GitHub Pages URL"
echo "4. Add notification credentials (Twilio, Telegram) if needed"
echo ""
echo "5. Restart services after configuration:"
echo "   cd $SAFEOS_DIR"
echo "   docker compose -f docker-compose.prod.yml down"
echo "   docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "6. Enable the firewall (after verifying SSH access):"
echo "   ufw enable"
echo ""
echo "View logs:"
echo "   docker compose -f docker-compose.prod.yml logs -f"
echo ""
echo "Check status:"
echo "   docker compose -f docker-compose.prod.yml ps"
echo ""
echo "============================================================================="
