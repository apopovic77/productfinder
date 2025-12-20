# ProductFinder - GSG/O'Neal Server Deployment

## Overview

This document describes the second deployment target for ProductFinder on the GSG/O'Neal Server (aiserver.oneal.eu), which uses the local **oneal-api-v2** with PostgreSQL backend.

## Server Details

| Property | Value |
|----------|-------|
| **Host** | aiserver.oneal.eu |
| **External URL** | https://gsgbot.arkturian.com |
| **ProductFinder URL** | https://gsgbot.arkturian.com/productfinder/ |
| **API** | oneal-api-v2 (local PostgreSQL) |
| **User** | gsgbot |

## GitHub Secrets Required

Add these secrets to your GitHub repository settings:

### Deployment Secrets

| Secret Name | Value |
|-------------|-------|
| `GSG_DEPLOY_HOST` | `aiserver.oneal.eu` |
| `GSG_DEPLOY_USER` | `gsgbot` |
| `GSG_DEPLOY_SSH_KEY` | *(SSH private key for gsgbot)* |
| `GSG_DEPLOY_PORT` | `22` |

### API Configuration Secrets

| Secret Name | Value |
|-------------|-------|
| `GSG_VITE_ONEAL_API_BASE` | `https://gsgbot.arkturian.com/oneal-api/v1` |
| `GSG_VITE_ONEAL_API_KEY` | `oneal_api_key_2024` |
| `GSG_VITE_STORAGE_API_URL` | `https://gsgbot.arkturian.com/storage-api` |
| `GSG_VITE_STORAGE_PROXY_URL` | `https://gsgbot.arkturian.com/share/proxy.php` |
| `GSG_VITE_STORAGE_API_KEY` | `gsg_storage_key_2024` |

## Workflow

The deployment is triggered by `.github/workflows/deploy-gsg.yml`:

1. Push to `main` branch triggers both deployments (arkturian + gsg)
2. Build is done with GSG-specific environment variables
3. Deployment via SSH to aiserver.oneal.eu
4. Files deployed to `/var/www/productfinder/site/`

## Local Services

| Service | Port | URL Path |
|---------|------|----------|
| oneal-api-v2 | 8004 | `/oneal-api/` |
| storage-api | 8001 | `/storage-api/` |
| api-ai | 8003 | `/api-ai/` |

## Key Differences from Arkturian Deployment

| Feature | Arkturian | GSG/O'Neal |
|---------|-----------|------------|
| API | oneal-api (MongoDB) | oneal-api-v2 (PostgreSQL) |
| Products | ~800 from Shopify sync | ~800 from local PostgreSQL |
| Images | arkturian storage-api | local storage-api with SMB reference mode |
| URL | productfinder.arkturian.com | gsgbot.arkturian.com/productfinder/ |

## Testing

After deployment, verify:

1. **ProductFinder loads**: https://gsgbot.arkturian.com/productfinder/
2. **API responds**: https://gsgbot.arkturian.com/oneal-api/v1/health
3. **Products load**: Check browser console for API calls
4. **Images load**: Verify product images appear (via storage-api)

## Rollback

```bash
ssh gsgbot@aiserver.oneal.eu
cd /var/www/productfinder/repo
bash .devops/rollback.sh
```
