#!/usr/bin/env bash
# SkateHubba Staging Server Setup
# Run on a fresh Ubuntu 22.04+ DigitalOcean/AWS instance.
#
# Usage:
#   export DOMAIN=staging.skatehubba.com
#   export EMAIL=admin@skatehubba.com
#   curl -fsSL <this-script-url> | bash
#   — or —
#   bash deploy/setup-server.sh

set -euo pipefail

DOMAIN="${DOMAIN:-staging.skatehubba.com}"
EMAIL="${EMAIL:-admin@skatehubba.com}"
APP_DIR="/opt/skatehubba"

echo "==> SkateHubba staging server setup"
echo "    Domain: $DOMAIN"
echo "    Email:  $EMAIL"
echo ""

# ── 1. System updates & prerequisites ────────────────────────────────────────

echo "==> Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg lsb-release ufw

# ── 2. Docker ─────────────────────────────────────────────────────────────────

if ! command -v docker &>/dev/null; then
  echo "==> Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
    gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  echo "    Docker installed: $(docker --version)"
else
  echo "    Docker already installed: $(docker --version)"
fi

# ── 3. Firewall ───────────────────────────────────────────────────────────────

echo "==> Configuring firewall (UFW)..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
echo "    Firewall configured (SSH, HTTP, HTTPS)"

# ── 4. Project directory ──────────────────────────────────────────────────────

echo "==> Setting up project at $APP_DIR..."
mkdir -p "$APP_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  echo "    Cloning repository..."
  git clone https://github.com/myhuemungusD/skatehubba.git "$APP_DIR"
else
  echo "    Repository already cloned, pulling latest..."
  git -C "$APP_DIR" pull origin staging
fi

cd "$APP_DIR"
git checkout staging

# ── 5. Environment file ──────────────────────────────────────────────────────

if [ ! -f "$APP_DIR/.env.staging" ]; then
  echo ""
  echo "WARNING: .env.staging not found!"
  echo "Copy the template and fill in your secrets:"
  echo "  cp $APP_DIR/.env.staging.example $APP_DIR/.env.staging"
  echo "  nano $APP_DIR/.env.staging"
  echo ""
fi

# ── 6. SSL certificate (Let's Encrypt) ───────────────────────────────────────

echo "==> Obtaining SSL certificate for $DOMAIN..."

# Create a temporary nginx config for the initial cert request
mkdir -p /tmp/certbot-init
cat > /tmp/certbot-init/default.conf <<'NGINX'
server {
    listen 80;
    server_name _;
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 200 'waiting for certificate...';
        add_header Content-Type text/plain;
    }
}
NGINX

# Start a temporary nginx for the ACME challenge
docker run -d --name certbot-nginx \
  -p 80:80 \
  -v /tmp/certbot-init/default.conf:/etc/nginx/conf.d/default.conf:ro \
  -v skatehubba_certbot-webroot:/var/www/certbot \
  nginx:alpine

sleep 2

# Request the certificate
docker run --rm \
  -v skatehubba_certbot-webroot:/var/www/certbot \
  -v skatehubba_certbot-certs:/etc/letsencrypt \
  certbot/certbot certonly \
    --webroot -w /var/www/certbot \
    -d "$DOMAIN" \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    --non-interactive

# Clean up temporary nginx
docker stop certbot-nginx && docker rm certbot-nginx
rm -rf /tmp/certbot-init

echo "    SSL certificate obtained for $DOMAIN"

# ── 7. Start services ────────────────────────────────────────────────────────

echo "==> Starting SkateHubba staging..."
cd "$APP_DIR"
docker compose -f docker-compose.staging.yml up -d --build

echo ""
echo "==> Waiting for services to become healthy..."
sleep 10

docker compose -f docker-compose.staging.yml ps

echo ""
echo "========================================="
echo "  SkateHubba staging is live!"
echo "  https://$DOMAIN"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Ensure DNS A record for $DOMAIN points to this server's IP"
echo "  2. Fill in .env.staging with your secrets if you haven't already"
echo "  3. Run database migrations: docker compose -f docker-compose.staging.yml exec app node --import tsx server/db/migrate.ts"
echo "  4. Certbot will auto-renew certificates via the certbot container"
echo ""
