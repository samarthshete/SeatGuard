#!/bin/bash

echo "⚡ Starting TicketBlitz One-Click Deployment..."

# 1. Login to Railway
echo "🔓 Step 1: Log in to Railway (Opens your browser)..."
railway login

# 2. Login to Vercel
echo "🔓 Step 2: Log in to Vercel (Opens your browser)..."
vercel login

# 3. Railway Setup
echo "🏗️ Step 3: Initializing Railway Project..."
railway link --project Ticket-Blitz || railway init --name Ticket-Blitz

# 4. Provisioning Hints
echo "----------------------------------------------------"
echo "🛠️ QUICK ACTION REQUIRED:"
echo "1. Go to https://neon.tech - Copy your DATABASE_URL"
echo "2. Go to https://upstash.com - Copy your Redis & Kafka keys"
echo "----------------------------------------------------"

read -p "Enter your DATABASE_URL from Neon: " db_url
read -p "Enter your REDIS_HOST from Upstash: " redis_host
read -p "Enter your REDIS_PORT (default 6379): " redis_port
read -p "Enter your KAFKA_BROKERS from Upstash: " kafka_brokers

# Set Variables in Railway
echo "📡 Syncing variables to Railway..."
railway vars set DATABASE_URL=$db_url REDIS_HOST=$redis_host REDIS_PORT=${redis_port:-6379} KAFKA_BROKERS=$kafka_brokers

# 5. Vercel Handoff
echo "🚀 Step 4: Deploying Frontend to Vercel..."
cd client
vercel link --yes
vercel env add VITE_API_URL production --value $(railway domain | head -n 1)
vercel --prod --yes

echo "✅ TicketBlitz is going Live! Check your Vercel Dashboard for the link."
