# Workflow & Development Guidelines

**WICHTIG**: Diese Dokumentation beschreibt den korrekten Workflow für dieses Projekt. Abweichungen von diesem Workflow führen zu Inkonsistenzen zwischen lokalem Code und Server.

## 🎯 Grundprinzipien

1. **ALLE Code-Änderungen** müssen durch Git und den DevOps-Pipeline gehen
2. **NIEMALS** Scripts mit `scp` auf den Server kopieren
3. **NIEMALS** Code direkt am Server editieren
4. **IMMER** den `push-dev.sh` Script verwenden für Deployments
5. **SSH** nur für Debugging, Logs und Database-Operations verwenden

## 📁 Projekt-Struktur

### Lokal (Entwicklungsmaschine)

```
/Volumes/DatenAP/Code/
├── productfinder/                    # Frontend (Product Finder App)
│   ├── src/
│   ├── docs/                         # Dokumentation
│   ├── .devops/
│   │   └── scripts/
│   │       └── push-dev.sh          # Deployment Script
│   └── dist/                         # Build Output
│
├── oneal-api/                        # Backend (Product API)
│   ├── app/
│   │   ├── data/
│   │   │   └── products.json        # Produkt-Daten mit storage_ids
│   │   └── main.py
│   ├── .devops/
│   │   └── scripts/
│   │       ├── push-dev.sh
│   │       ├── release.sh
│   │       └── rollback.sh
│   └── .github/workflows/
│       ├── dev.yml                   # CI für dev branch
│       └── deploy.yml                # CD für main branch
│
└── storage-api/                      # Storage System (Image Management)
    ├── storage/
    ├── .devops/
    │   └── scripts/
    │       └── push-dev.sh
    └── .github/workflows/
```

### Server (arkturian.com)

```
/var/www/                             # Aktive Deployments
├── oneal-api/                        # Backend Deployment
│   ├── app/
│   ├── .git/                         # Git Repository
│   └── .devops/
│
├── api-storage.arkturian.com/        # Storage API Deployment
│   ├── storage/
│   └── .git/
│
└── [andere Projekte...]

/opt/repos/                           # Git Repositories (für CD)
├── oneal-api/                        # Wird von GitHub Actions verwendet
└── [andere repos...]

/mnt/backup-disk/
└── uploads/
    └── storage/                      # Storage Files
        ├── media/
        │   ├── oneal/               # O'Neal Produkt-Bilder
        │   └── [andere collections...]
        ├── thumbnails/
        └── webview/

/var/backups/                         # Automatische Backups
├── oneal-api-20251030-094500/
└── [andere backups...]
```

## 🚀 Korrekter Workflow

### 1. Entwicklung starten

```bash
cd /Volumes/DatenAP/Code/productfinder

# Neuen Feature Branch erstellen (optional)
git checkout -b feature/my-feature

# Code ändern...
# src/types/Product.ts bearbeiten
# src/components/ProductCard.vue anpassen
# etc.
```

### 2. Testen (Lokal)

```bash
# Development Server starten
npm run dev

# Build testen
npm run build

# Im Browser testen: http://localhost:5173
```

### 3. Changes committen und deployen

```bash
# Alle Änderungen stagen und auf dev pushen
.devops/scripts/push-dev.sh "Add LOD system for product images"

# Alternative: Manuell
git add -A
git commit -m "Add LOD system for product images"
git push origin dev
```

**Was passiert dann automatisch:**
1. Code wird zu GitHub gepusht (dev branch)
2. GitHub Actions CI läuft (`.github/workflows/dev.yml`)
   - Dependencies installieren
   - Build durchführen
   - Tests ausführen
3. Wenn CI grün ist → Ready für Production

### 4. Production Deployment

```bash
# Merge dev → main (löst automatisches Deployment aus)
git checkout main
git merge dev
git push origin main
```

**Was passiert automatisch:**
1. GitHub Actions CD läuft (`.github/workflows/deploy.yml`)
2. SSH Verbindung zum Server
3. Code wird zu `/opt/repos/oneal-api` geklont/gepullt
4. Backup wird erstellt → `/var/backups/oneal-api-TIMESTAMP/`
5. Deployment nach `/var/www/oneal-api`
6. Dependencies installieren
7. Service restart: `systemctl restart oneal-api`
8. Health Check

## 🔧 DevOps Scripts

### `push-dev.sh` - Development Deployment

**Verwendung:**
```bash
./devops/scripts/push-dev.sh "Commit message here"

# Oder direkter Aufruf:
.devops/scripts/push-dev.sh "Fix image loading bug"
```

**Was es macht:**
1. Checkout dev branch
2. Fetch & pull latest changes
3. Stage alle Änderungen (`git add -A`)
4. Commit mit Message
5. Push zu origin dev

### `release.sh` - Production Release

**Verwendung:**
```bash
./devops/scripts/release.sh
```

**Was es macht:**
1. Merge dev → main
2. Push to main
3. Triggert automatisches Deployment via GitHub Actions

### `rollback.sh` - Rollback zu vorheriger Version

**Verwendung:**
```bash
./devops/scripts/rollback.sh
```

**Was es macht:**
1. Listet verfügbare Backups in `/var/backups/`
2. Restored ausgewähltes Backup
3. Restart Service

## 🔐 SSH Zugang

### Wann SSH verwenden?

**✅ ERLAUBT (Debugging & Monitoring):**
- Logs checken: `journalctl -u oneal-api -f`
- Service Status: `systemctl status oneal-api`
- Database Queries ausführen
- Disk Space checken: `df -h`
- Files anschauen (read-only): `cat /var/www/oneal-api/app/data/products.json`
- Process monitoring: `htop`, `ps aux`
- Network debugging: `netstat -tulpn`

**❌ VERBOTEN (Code Deployment):**
- Scripts mit `scp` kopieren
- Code Files editieren: `vim /var/www/oneal-api/app/main.py`
- Manuell Files uploaden
- Git commits direkt am Server
- Dependencies installieren ohne Pipeline

### SSH Verbindung

```bash
# SSH als root
ssh root@arkturian.com

# Oder mit spezifischem Key
ssh -i ~/.ssh/arkturian_key root@arkturian.com
```

### Wichtige Server Commands

```bash
# Service Status checken
systemctl status oneal-api
systemctl status storage-api

# Logs anschauen
journalctl -u oneal-api -f --lines=100

# Service restart (falls nötig)
systemctl restart oneal-api

# Database Backup
cd /var/www/api-storage.arkturian.com
python backup_db.py

# Disk Usage checken
df -h /mnt/backup-disk/

# Nginx Logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

## 📊 Deployment Endpoints

### Frontend (Product Finder)

- **Lokal Dev**: http://localhost:5173
- **Production**: [TBD - wird über CDN deployed]

### Backend APIs

- **O'Neal API**: https://oneal-api.arkturian.com
  - Port: 8003
  - Service: `oneal-api.service`
  - Location: `/var/www/oneal-api`

- **Storage API**: https://api-storage.arkturian.com
  - Port: 8001
  - Service: `storage-api.service`
  - Location: `/var/www/api-storage.arkturian.com`

## 🐛 Debugging Workflow

### Problem: Image wird nicht geladen

**FALSCH ❌:**
```bash
# Direkt am Server fixen
ssh root@arkturian.com
vim /var/www/oneal-api/app/main.py
# Code ändern...
systemctl restart oneal-api
```

**RICHTIG ✅:**
```bash
# 1. Problem identifizieren via SSH
ssh root@arkturian.com
journalctl -u oneal-api -f    # Logs checken
cat /var/www/oneal-api/app/data/products.json | grep storage_id  # Data checken

# 2. Lokal fixen
cd /Volumes/DatenAP/Code/oneal-api
# Code anpassen in app/main.py
npm test  # Testen

# 3. Via Pipeline deployen
.devops/scripts/push-dev.sh "Fix image loading in LOD system"

# 4. Verify on server
ssh root@arkturian.com
journalctl -u oneal-api -n 50  # Check deployment logs
```

## 📝 Database Operations

### Products.json aktualisieren

**FALSCH ❌:**
```bash
# products.json direkt am Server editieren
ssh root@arkturian.com
vim /var/www/oneal-api/app/data/products.json
```

**RICHTIG ✅:**
```bash
# 1. Lokal aktualisieren
cd /Volumes/DatenAP/Code/oneal-api
# products.json editieren oder via Script generieren

# 2. Via Pipeline deployen
.devops/scripts/push-dev.sh "Update products.json with storage_ids"
```

### Storage Database Operations

Für Database-Operationen kannst du Scripts lokal erstellen und via SSH ausführen:

```bash
# 1. Script lokal erstellen
cd /Volumes/DatenAP/Code/storage-api
# scripts/cleanup_storage.py erstellen

# 2. Script committen
git add scripts/cleanup_storage.py
git commit -m "Add storage cleanup script"
git push origin dev

# 3. Auf Server pullen und ausführen
ssh root@arkturian.com
cd /var/www/api-storage.arkturian.com
git pull origin dev
python scripts/cleanup_storage.py
```

## 🔄 CI/CD Pipeline Details

### Dev Branch CI (`.github/workflows/dev.yml`)

**Trigger:** Push zu `dev` branch

**Steps:**
1. Checkout code
2. Setup Node.js / Python
3. Install dependencies
4. Run linter
5. Run tests
6. Build application

**Status:** ✅ Muss grün sein vor Merge zu main

### Main Branch CD (`.github/workflows/deploy.yml`)

**Trigger:** Push zu `main` branch (nach Merge von dev)

**Steps:**
1. Checkout code
2. SSH zu Server (root@arkturian.com)
3. Clone/Pull zu `/opt/repos/oneal-api`
4. Create backup → `/var/backups/oneal-api-TIMESTAMP/`
5. Deploy zu `/var/www/oneal-api`
6. Install dependencies (`pip install -r requirements.txt`)
7. Restart service (`systemctl restart oneal-api`)
8. Health check (HTTP GET zu API endpoint)
9. Rollback if health check fails

## 🚨 Häufige Fehler & Lösungen

### Fehler 1: "SSH Copy Script"

**Problem:**
```bash
# FALSCH!
scp /tmp/import_script.py root@arkturian.com:/tmp/
ssh root@arkturian.com "python /tmp/import_script.py"
```

**Lösung:**
```bash
# Script ins Projekt committen
cd /Volumes/DatenAP/Code/oneal-api
mkdir -p scripts
mv /tmp/import_script.py scripts/
git add scripts/import_script.py
git commit -m "Add import script"
git push origin dev

# Dann am Server via Git ausführen
ssh root@arkturian.com
cd /var/www/oneal-api
git pull origin dev
python scripts/import_script.py
```

### Fehler 2: "Direkt am Server editieren"

**Problem:** Code wurde direkt am Server geändert, existiert nicht in Git

**Lösung:**
```bash
# 1. Changes vom Server sichern
ssh root@arkturian.com
cd /var/www/oneal-api
git diff > /tmp/server-changes.patch

# 2. Patch lokal applyen
cd /Volumes/DatenAP/Code/oneal-api
scp root@arkturian.com:/tmp/server-changes.patch .
git apply server-changes.patch

# 3. Proper commit & deploy
git add -A
git commit -m "Apply server hotfix properly"
git push origin dev
```

### Fehler 3: "Storage Files falsch uploaded"

**Problem:** Images wurden manuell nach `/mnt/backup-disk/uploads/` kopiert

**Lösung:** Storage API verwenden oder Script via Pipeline deployen:
```python
# scripts/import_images.py im Git Repository
import requests

def upload_via_api(image_url, product_id):
    response = requests.post(
        "https://api-storage.arkturian.com/storage/fetch",
        headers={"X-API-Key": os.getenv("API_KEY")},
        json={
            "url": image_url,
            "collection_id": "oneal_catalog",
            "link_id": product_id,
            "is_public": True,
            "analyze": False
        }
    )
    return response.json()
```

## 📚 Weitere Ressourcen

- **GitHub Repos:**
  - Frontend: `apopovic77/productfinder`
  - Backend: `apopovic77/oneal-api`
  - Storage: `apopovic77/storage-api`

- **Server Dokumentation:**
  - O'Neal API: `/var/www/oneal-api/DEVOPS_SETUP.md`
  - Storage API: `/var/www/api-storage.arkturian.com/README.md`

- **System Docs:**
  - LOD System: `/Volumes/DatenAP/Code/productfinder/docs/LOD_SYSTEM.md`
  - API Index: `/var/www/API_SYSTEM_INDEX.md`

## ✅ Checklist für jeden Task

Bevor du Code änderst, frage dich:

- [ ] Wird der Code lokal geändert (nicht am Server)?
- [ ] Verwende ich `push-dev.sh` für Deployment?
- [ ] Sind alle Scripts im Git Repository?
- [ ] Verwende ich SSH nur für Debugging/Monitoring?
- [ ] Habe ich CI/CD Pipeline durchlaufen lassen?
- [ ] Sind Backups aktiviert vor Production-Deployment?
- [ ] Ist die Dokumentation aktuell?

---

**Letzte Aktualisierung:** 2025-10-30
**Maintainer:** alex@arkturian.com
