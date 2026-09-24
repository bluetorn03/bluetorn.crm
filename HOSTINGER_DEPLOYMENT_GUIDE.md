# BLUETORN CRM Production Deployment Guide
**Target Domain**: `https://realestate.bluetorn.com`  
**Application**: BLUETORN CRM (Real Estate CRM & ERP)  
**Target Environment**: Hostinger Business Web Hosting / Hostinger VPS  

---

## 1. Architecture

BLUETORN CRM is a modern fullstack web application consisting of:
- **Client Frontend**: React 19 Single-Page Application (SPA) compiled with Vite 8 and TanStack Router.
- **Server / Backend**: Nitro (`preset: "node-server"`) executing inside a Node.js runtime (`node .output/server/index.mjs`).
- **RPC Communication**: TanStack Start `createServerFn` Remote Procedure Calls communicating over HTTP `/_server/`.
- **Database Layer**: Production MySQL 8.0 / MariaDB 10.5+ accessed via `mysql2/promise` with connection pooling and transactions.
- **Session & Auth**: HTTP-only, secure, signed session cookies (`bt_session`) validated against MySQL `profiles` and `user_roles`.

### Production Request Pipeline
```
Internet User
   ↓
https://realestate.bluetorn.com (HTTPS Port 443)
   ↓
Nginx / Hostinger Web Server (Reverse Proxy + SSL Termination)
   ↓
Node.js + Nitro Server (Port 3000 / 127.0.0.1:3000)
   ↓
MySQL Production Database (Port 3306 / UTF-8 mb4)
```

---

## 2. Hostinger Requirements

### Supported Environments
The application can be deployed on either of two Hostinger configurations:

#### Option A: Hostinger Business Web Hosting (Existing Plan)
- **Hostinger Plan**: Business Web Hosting (`hostinger_business_v5`)
- **Node.js Feature**: Built-in Node.js Application Manager (Passenger/CloudLinux)
- **Node.js Version**: **Node.js 20.x or 22.x**
- **App Type**: `nitro`
- **Database**: Hostinger Cloud MySQL (included with hPanel)

#### Option B: Hostinger VPS (Enterprise Standard)
- **Hostinger Plan**: KVM 1, KVM 2, or higher
- **OS**: Ubuntu 22.04 LTS or Ubuntu 24.04 LTS
- **Memory**: Minimum 2 GB RAM (4 GB recommended)
- **Software Stack**: Node.js 20/22, Nginx, PM2, MySQL 8.0, Certbot (Let's Encrypt)

---

## 3. Domain Setup

1. Log in to your **Hostinger hPanel** (`https://hpanel.hostinger.com`).
2. Navigate to **Websites** → **Add Website** or **Subdomains**.
3. Create the subdomain `realestate` under the root domain `bluetorn.com`:
   - Subdomain: `realestate`
   - Custom folder: `public_html/realestate` (or `/home/YOUR_USERNAME/domains/realestate.bluetorn.com/public_html`)
4. Confirm creation. Hostinger will create the vhost directory and configure web server routing.

---

## 4. DNS Setup

Configure the DNS zone for `bluetorn.com` so that `realestate.bluetorn.com` points to your Hostinger server.

### Hostinger DNS Zone Configuration
In **hPanel** → **DNS Zone Editor** for `bluetorn.com`:

| Type | Name | Content / Value | TTL | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `realestate` | `YOUR_HOSTINGER_IP` (e.g., `145.79.58.184`) | 300 | Primary IPv4 record |
| **AAAA** | `realestate` | `YOUR_HOSTINGER_IPV6` (e.g., `2a02:4780:61:2318:0:a04:f952:6`) | 300 | Optional IPv6 record |

*(If managing DNS via Cloudflare, add an A record for `realestate` pointing to `YOUR_HOSTINGER_IP` with Proxy status enabled or DNS-only during initial SSL issuance).*

### Verification Command
Run from your local terminal or server:
```bash
nslookup realestate.bluetorn.com
# OR
dig realestate.bluetorn.com +short
```
Expected output: Returns `YOUR_HOSTINGER_IP`.

---

## 5. MySQL Database Setup

1. In **Hostinger hPanel**, navigate to **Databases** → **Management**.
2. Click **Create Database**:
   - **Database Name**: `YOUR_DB_NAME` (e.g., `u168098130_bluetorn_crm`)
   - **Username**: `YOUR_DB_USER` (e.g., `u168098130_bluetorn_crm`)
   - **Password**: `YOUR_DB_PASSWORD` (use a strong 24+ character password containing letters, numbers, and symbols)
3. Click **Create**.
4. Note the database host:
   - When connecting from the same Hostinger server: `localhost`
   - When connecting externally: `srv2218.hstgr.io` (or the host listed in hPanel)

---

## 6. Database Import (Fresh Installation)

To set up the database schema from scratch:

### Method 1: Using phpMyAdmin (Web UI)
1. In hPanel → **Databases**, find `YOUR_DB_NAME` and click **Enter phpMyAdmin**.
2. Select your database in the left sidebar.
3. Click the **Import** tab in the top navigation.
4. Under **File to import**, click **Choose File** and select `mysql_schema.sql` from your project folder.
5. Ensure the character set is **utf-8**.
6. Scroll to the bottom and click **Import**.
7. All 17 core CRM tables will be created:
   - `workspaces`
   - `profiles` (with `whatsapp_phone`)
   - `user_roles`
   - `customers` (with `assigned_to` and `assigned_at`)
   - `properties` (with `assigned_to` and `assigned_at`)
   - `leads` (with `assigned_to`, `assigned_at`, `score`)
   - `lead_activities`
   - `tasks` (with `assigned_to` and `assigned_at`)
   - `calendar_events`
   - `invoices`
   - `invoice_items`
   - `payments`
   - `plans`
   - `promo_media`
   - `platform_settings`
   - `audit_logs`
   - `notifications`

### Method 2: Command Line (SSH / Terminal)
```bash
mysql -u YOUR_DB_USER -p YOUR_DB_NAME < mysql_schema.sql
```
*(Enter `YOUR_DB_PASSWORD` when prompted).*

---

## 7. Database Migration (Existing Database)

If the database already contains live CRM records, **DO NOT re-import `mysql_schema.sql` directly** with `DROP TABLE`. Instead, use the automated idempotent migration script provided in the codebase:

```bash
# Ensure .env contains production credentials
node scripts/migrate.mjs
```

### What `scripts/migrate.mjs` Does:
1. Validates connectivity to `YOUR_DB_NAME`.
2. Creates any missing tables using `CREATE TABLE IF NOT EXISTS`.
3. Checks if `profiles.whatsapp_phone` exists; adds it if absent.
4. Checks if `assigned_at` exists on `leads`, `customers`, `properties`, and `tasks`; adds it if absent.
5. Verifies all foreign keys and indexes.
6. Operates non-destructively without altering or deleting existing data.

---

## 8. Environment Variables

Create a file named `.env` in the root of your application directory on the server:

```env
# ==============================================================================
# BLUETORN CRM — PRODUCTION ENVIRONMENT
# Target: https://realestate.bluetorn.com
# ==============================================================================
NODE_ENV=production
PORT=3000
HOST=127.0.0.1

# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=YOUR_DB_NAME
DB_USER=YOUR_DB_USER
DB_PASSWORD=YOUR_DB_PASSWORD

# Display Timezone
TZ=Asia/Kolkata
```

### Environment Variables Reference Table

| Variable | Required | Production Value | Purpose |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | `production` | Enables production optimizations and `Secure` cookie flag |
| `PORT` | No | `3000` | Port for Nitro server process |
| `HOST` | No | `127.0.0.1` | Local interface binding |
| `DB_HOST` | **Yes** | `localhost` or `srvXXXX.hstgr.io` | MySQL server host |
| `DB_PORT` | **Yes** | `3306` | MySQL port |
| `DB_NAME` | **Yes** | `YOUR_DB_NAME` | Name of CRM database |
| `DB_USER` | **Yes** | `YOUR_DB_USER` | MySQL database username |
| `DB_PASSWORD` | **Yes** | `YOUR_DB_PASSWORD` | Strong database password |
| `TZ` | Recommended | `Asia/Kolkata` | Application timezone |

> [!WARNING]
> Set file permissions on `.env` to `600` (`chmod 600 .env`) so that other server users cannot read database credentials.

---

## 9. Application Upload

We provide pre-packaged archives in the repository root:
- `app.zip` (standard ZIP archive)
- `app.tar.gz` (POSIX tarball)

### Upload Method 1: Hostinger File Manager (hPanel)
1. Go to **hPanel** → **Files** → **File Manager**.
2. Open the directory for `realestate.bluetorn.com` (e.g. `/home/YOUR_USERNAME/domains/realestate.bluetorn.com/public_html`).
3. Click **Upload** → Select `app.zip`.
4. Right-click `app.zip` and select **Extract** → choose current directory.
5. Delete `app.zip` after extraction.

### Upload Method 2: SCP / SFTP (SSH Terminal)
```bash
# Upload via SCP
scp app.zip YOUR_USERNAME@YOUR_HOSTINGER_IP:/home/YOUR_USERNAME/domains/realestate.bluetorn.com/public_html/

# SSH into server and extract
ssh YOUR_USERNAME@YOUR_HOSTINGER_IP
cd /home/YOUR_USERNAME/domains/realestate.bluetorn.com/public_html/
unzip app.zip
rm app.zip
```

---

## 10. Node.js Setup

### On Hostinger Business Web Hosting:
1. In hPanel, navigate to **Advanced** → **Node.js**.
2. Configure settings:
   - **Node.js Version**: `22.x` (or `20.x LTS`)
   - **Application Mode**: `Production`
   - **Application Root**: `/home/YOUR_USERNAME/domains/realestate.bluetorn.com/public_html`
   - **Application Startup File**: `server/index.mjs` (or `.output/server/index.mjs`)
   - **Framework**: `nitro`

### On Hostinger VPS (Ubuntu):
```bash
# Install Node.js 22 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential

# Verify installation
node -v   # Should output v22.x.x
npm -v    # Should output v10.x.x
```

---

## 11. Build

On the server, run the clean installation and build commands:

```bash
# Navigate to application root
cd /home/YOUR_USERNAME/domains/realestate.bluetorn.com/public_html

# Install exact production dependencies
npm ci

# Run the production build
npm run build
```

Verify that the `.output` directory was created:
```bash
ls -la .output/server/index.mjs
ls -la .output/public/
```

---

## 12. Start (Development / Verification)

To test the built application directly:
```bash
# Start server manually
node .output/server/index.mjs
```
Expected output:
```
Listening on http://127.0.0.1:3000
```
Press `Ctrl + C` to stop once verified.

---

## 13. PM2 Process Management (For VPS Deployments)

For continuous production uptime, auto-restart on crashes, and startup on system boot:

### 1. Install PM2
```bash
sudo npm install -g pm2
```

### 2. Create `ecosystem.config.cjs`
In the application root:
```javascript
module.exports = {
  apps: [
    {
      name: "bluetorn-crm",
      script: ".output/server/index.mjs",
      cwd: "/var/www/realestate.bluetorn.com",
      instances: "max",
      exec_mode: "cluster",
      env_file: ".env",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "127.0.0.1",
      },
      max_memory_restart: "500M",
      restart_delay: 3000,
      exp_backoff_restart_delay: 100,
    },
  ],
};
```

### 3. Start & Save PM2 Service
```bash
# Start the CRM
pm2 start ecosystem.config.cjs

# Verify status
pm2 status

# Save the current list of processes
pm2 save

# Enable startup on server reboot
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u $USER --hp $HOME
```

### Useful PM2 Commands
```bash
pm2 logs bluetorn-crm        # View live logs
pm2 reload bluetorn-crm      # Zero-downtime reload
pm2 restart bluetorn-crm     # Restart process
pm2 stop bluetorn-crm        # Stop process
```

---

## 14. Reverse Proxy (Nginx Configuration for VPS)

When using a VPS, configure Nginx to terminate SSL and reverse proxy requests to the internal Node/Nitro server on port 3000.

Create `/etc/nginx/sites-available/realestate.bluetorn.com`:
```nginx
server {
    listen 80;
    listen [::]:80;
    server_name realestate.bluetorn.com;

    # Redirect all HTTP requests to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name realestate.bluetorn.com;

    # SSL Certificate Paths (generated by Certbot)
    ssl_certificate /etc/letsencrypt/live/realestate.bluetorn.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/realestate.bluetorn.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

    # Client Static Assets Caching (optional direct serving)
    location /assets/ {
        alias /var/www/realestate.bluetorn.com/.output/public/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        access_log off;
    }

    # Pass all other traffic (including SPA routes and /_server/ API) to Nitro
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for longer database operations / migrations
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable the configuration:
```bash
sudo ln -s /etc/nginx/sites-available/realestate.bluetorn.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 15. SSL / HTTPS Setup

### On Hostinger Business Hosting:
1. In hPanel, go to **Security** → **SSL**.
2. Find `realestate.bluetorn.com`.
3. Click **Install SSL** (Hostinger provides free lifetime Let's Encrypt certificates).
4. Enable **Force HTTPS** toggle in hPanel.

### On Hostinger VPS (Certbot):
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d realestate.bluetorn.com
```
Certbot automatically installs certificate renewal cron jobs (`sudo certbot renew --dry-run`).

---

## 16. Authentication & First-Time Setup

1. Open your browser and navigate to:
   ```
   https://realestate.bluetorn.com/setup
   ```
2. The initial setup wizard will verify that no Super Admin exists.
3. Fill in the **Platform Super Admin** form:
   - **User ID / Code**: e.g., `admin` (or `SUPER_01`)
   - **Full Name**: e.g., `System Administrator`
   - **Email**: Your official administrative email
   - **Password**: Strong administrator password
4. Click **Create Super Admin Account**.
5. Once created, visit:
   ```
   https://realestate.bluetorn.com
   ```
6. Log in with:
   - **Workspace Code**: `PLATFORM` (for Super Admin)
   - **User ID**: `admin`
   - **Password**: Your configured password
7. From the Super Admin console, create your primary workspace (e.g. Workspace Code: `BLUETORN`) and your first Owner account.

---

## 17. Production Verification Checklist

Run through this post-deployment checklist to confirm end-to-end operation:

- [ ] **1. Domain Resolution**: `https://realestate.bluetorn.com` resolves with a green padlock.
- [ ] **2. HTTPS Enforcement**: `http://realestate.bluetorn.com` redirects automatically to `https://`.
- [ ] **3. Setup Route**: `/setup` loads cleanly and displays the setup wizard (or redirects if already initialized).
- [ ] **4. Super Admin Login**: Can sign in with `PLATFORM` + `admin` credentials.
- [ ] **5. Owner Login**: Can sign in with workspace code and owner credentials.
- [ ] **6. Session Cookie**: Browser DevTools → Application → Cookies shows `bt_session` with `HttpOnly`, `Secure`, and `SameSite=Lax`.
- [ ] **7. Browser Refresh**: Refreshing `/app`, `/app/leads`, or `/app/settings` keeps the active session without 404s.
- [ ] **8. Leads Pipeline**: Create a lead, assign to a user, and verify status updates.
- [ ] **9. Lead Conversion**: Convert a lead into a customer and verify customer record creation.
- [ ] **10. Properties**: Add a property, verify image URL display, and view details.
- [ ] **11. Tasks & Calendar**: Schedule a task with due datetime and verify it appears on `/app/calendar`.
- [ ] **12. Follow-ups**: Schedule a follow-up date and verify display in IST format.
- [ ] **13. Notifications**: Assignment triggers a notification visible under bell icon.
- [ ] **14. Owner vs Employee Role**: Employee only sees assigned items (unless granted broader permissions).
- [ ] **15. MySQL Persistence**: Run `SELECT * FROM leads ORDER BY created_at DESC LIMIT 1;` in phpMyAdmin to verify records are written directly to MySQL.
- [ ] **16. No Localhost Calls**: Browser DevTools Network tab displays zero requests to `localhost` or `127.0.0.1`.
- [ ] **17. Zero Console Errors**: Browser DevTools Console tab shows zero uncaught exceptions.
- [ ] **18. Logout**: Clicking Logout deletes `bt_session` cookie and redirects to `/`.

---

## 18. Backup Procedure

### Database Backup (Daily Automated / Pre-Deployment)
```bash
# Dump MySQL database with timestamps
mysqldump -u YOUR_DB_USER -p YOUR_DB_NAME --single-transaction --routines --triggers > "backup_$(date +%Y%m%d_%H%M%S).sql"
```

### Application Files Backup
```bash
tar -czf "app_files_backup_$(date +%Y%m%d_%H%M%S).tar.gz" \
  --exclude="node_modules" \
  --exclude=".output" \
  /home/YOUR_USERNAME/domains/realestate.bluetorn.com/public_html
```

---

## 19. Rollback Procedure

If a deployment encounters issues:

### 1. Rollback Application Code
```bash
# Extract previous backup
tar -xzf app_files_backup_PREVIOUS.tar.gz -C /home/YOUR_USERNAME/domains/realestate.bluetorn.com/public_html

# Rebuild and restart
npm ci
npm run build
pm2 reload bluetorn-crm  # or restart Node app in hPanel
```

### 2. Rollback Database (If schema migration failed)
```bash
mysql -u YOUR_DB_USER -p YOUR_DB_NAME < backup_PREVIOUS.sql
```

---

## 20. Troubleshooting

### 502 Bad Gateway
- **Cause**: Node.js / Nitro process is not running or crashed.
- **Fix**: Check PM2 status (`pm2 status`) or view logs (`pm2 logs bluetorn-crm`). Check for missing `.env` variables or port conflicts.

### Database Access Denied (`ER_ACCESS_DENIED_ERROR`)
- **Cause**: Incorrect `DB_USER` or `DB_PASSWORD` in `.env`.
- **Fix**: Verify credentials in Hostinger hPanel → Databases. Update `.env` and restart the process.

### Direct Refresh Returns 404
- **Cause**: Web server is attempting to serve a file directly instead of proxying to Nitro.
- **Fix**: In Nginx, verify `location / { proxy_pass http://127.0.0.1:3000; ... }`. In Hostinger Business hosting, verify application startup file is set to `server/index.mjs`.

### Session Disappears on Page Refresh
- **Cause**: `NODE_ENV` is set to `production`, but the site is being accessed over insecure HTTP (`http://` instead of `https://`). The browser rejects the `Secure` cookie.
- **Fix**: Access the site exclusively via `https://realestate.bluetorn.com` and ensure SSL certificate is active.

### Duplicate Column Error During Migration
- **Cause**: Running legacy raw migration scripts on an updated schema.
- **Fix**: Run `node scripts/migrate.mjs` which performs existence checks (`SHOW COLUMNS LIKE ...`) before attempting any table modifications.
