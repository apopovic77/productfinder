# ProductFinder Deployment Setup

## ✅ Completed Setup

### 1. Server Configuration (arkturian.com)

✅ **Directories created:**
- `/var/www/productfinder/repo` - Git repository for builds
- `/var/www/productfinder/site` - Public web root
- `/var/backups` - Backup storage

✅ **Nginx configured:**
- Site: `productfinder.arkturian.com`
- Config: `/etc/nginx/sites-available/productfinder.arkturian.com`
- Root: `/var/www/productfinder/site`
- Enabled and nginx reloaded ✓

### 2. DevOps Scripts (from github-starterpack)

✅ **Scripts installed in `.devops/`:**
- `deploy.sh` - Server deployment script
- `rollback.sh` - Rollback to previous backup
- `scripts/build-local.sh` - Local build verification
- `scripts/checkout-branch.sh` - Branch switching
- `scripts/push-dev.sh` - Commit and push to dev
- `scripts/release.sh` - Release to production (dev → main)
- `scripts/update-devops.sh` - Update DevOps templates

✅ **Helper script:**
- `./devops` - Convenient wrapper for all scripts

### 3. GitHub Actions CI/CD

✅ **Workflows created:**
- `.github/workflows/deploy.yml` - Build & deploy on push to `main`
- `.github/workflows/dev.yml` - CI checks on push to `dev`

✅ **Build process:**
- Node 20
- `npm ci` → `npm run build`
- Environment variables injected during build
- Artifacts deployed via SSH + rsync
- Nginx auto-reloaded

### 4. Git Repository

✅ **Initialized:**
- Main branch: `main`
- Dev branch: `dev`
- Initial commit with all files

## 🔧 Next Steps

### Step 1: Create GitHub Repository

```bash
# On GitHub, create a new repository: productfinder
# Then push your local repo:

cd /Volumes/DatenAP/Code/productfinder
git remote add origin https://github.com/YOUR_USERNAME/productfinder.git
git push -u origin main
git push -u origin dev
```

### Step 2: Configure GitHub Secrets

Go to: **GitHub Repo → Settings → Secrets and variables → Actions → New repository secret**

Add these secrets:

```
DEPLOY_HOST=arkturian.com
DEPLOY_USER=root
DEPLOY_SSH_KEY=<paste your private SSH key>
DEPLOY_PORT=22

VITE_ONEAL_API_BASE=https://oneal-api.arkturian.com/v1
VITE_ONEAL_API_KEY=oneal_demo_token
VITE_STORAGE_API_URL=https://api-storage.arkturian.com
VITE_STORAGE_API_KEY=<your-storage-key>
VITE_ARTRACK_API_BASE=https://api-artrack.arkturian.com
```

### Step 3: Setup Git Repository on Server

```bash
ssh root@arkturian.com

# Clone your GitHub repo into the repo directory
cd /var/www/productfinder/repo
git init
git remote add origin https://github.com/YOUR_USERNAME/productfinder.git
git fetch origin main
git checkout main

# Install dependencies
npm ci

# Test build
npm run build

# Test deployment
bash .devops/deploy.sh
```

### Step 4: DNS Configuration

Point `productfinder.arkturian.com` to your server IP:

```
A    productfinder.arkturian.com    →    YOUR_SERVER_IP
```

### Step 5: SSL Certificate (Optional but Recommended)

```bash
ssh root@arkturian.com

# Install certbot if not already installed
apt-get install certbot python3-certbot-nginx

# Get SSL certificate
certbot --nginx -d productfinder.arkturian.com

# Auto-renewal is configured automatically
```

## 🚀 Usage

### Development Workflow

```bash
# 1. Work on dev branch
git checkout dev

# 2. Make changes, then commit and push
./devops push "feat: add new feature"

# 3. Test locally
./devops build

# 4. When ready to deploy, release to main
./devops release
```

### What happens on release:

1. `./devops release` merges `dev` → `main`
2. Pushes `main` to GitHub
3. GitHub Actions triggers automatically
4. Builds the app with production env vars
5. SSHs to arkturian.com
6. Pulls latest code
7. Builds on server
8. Creates backup of current site
9. Deploys new build to `/var/www/productfinder/site`
10. Reloads nginx
11. Site is live at https://productfinder.arkturian.com 🎉

### Manual Deployment

If you need to deploy manually:

```bash
ssh root@arkturian.com
cd /var/www/productfinder/repo
bash .devops/deploy.sh
```

### Rollback

If something goes wrong:

```bash
ssh root@arkturian.com
cd /var/www/productfinder/repo
bash .devops/rollback.sh
# Select a backup from the list
```

## 📊 Monitoring

### Check Deployment Status

```bash
# View GitHub Actions runs
# Go to: GitHub Repo → Actions

# Check server logs
ssh root@arkturian.com
tail -f /var/log/nginx/productfinder.access.log
tail -f /var/log/nginx/productfinder.error.log
```

### Verify Deployment

```bash
# Check deployed files
ssh root@arkturian.com
ls -la /var/www/productfinder/site

# Check backups
ls -la /var/backups | grep productfinder
```

## 🔐 Security Notes

- Never commit `.env` files (already in `.gitignore`)
- Keep SSH keys secure
- Use GitHub Secrets for sensitive data
- Regularly update dependencies
- Monitor server logs for suspicious activity

## 📝 Configuration Files

- `.devops/starter-config.json` - DevOps configuration
- `.env.example` - Environment variables template
- `.github/workflows/deploy.yml` - Deployment workflow
- `nginx.conf` - `/etc/nginx/sites-available/productfinder.arkturian.com`

## 🆘 Troubleshooting

### Build fails on GitHub Actions

- Check GitHub Actions logs
- Verify all secrets are set correctly
- Test build locally: `./devops build`

### Deployment fails

- Check SSH connection: `ssh root@arkturian.com`
- Verify repo exists: `ls /var/www/productfinder/repo`
- Check permissions: `ls -la /var/www/productfinder`

### Site not accessible

- Check nginx: `ssh root@arkturian.com "systemctl status nginx"`
- Check nginx config: `ssh root@arkturian.com "nginx -t"`
- Check DNS: `nslookup productfinder.arkturian.com`
- Check firewall: Port 80/443 open?

### Need help?

Check the documentation:
- `.devops/SETUP.md` - Setup guide
- `.devops/SCRIPTS.md` - Script documentation
- `.devops/RELEASE_FLOW.md` - Release workflow
- `README.md` - Project overview

