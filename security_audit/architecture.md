# ATC Vision — Architecture & Threat Model Map

## 1. System Overview
ATC Vision is an industrial shift-report and reliability intelligence platform designed for SAP PM (Plant Maintenance) records in steel manufacturing plants (ArcelorMittal Tubos).
The application is deployed at `https://vision.fk.adm.br` behind Cloudflare WAF/CDN and Cloudflare Access (Zero Trust).

- **Backend:** FastAPI (Python 3.12), SQLAlchemy 2.0 (async), PostgreSQL 16 (production), SQLite (test harness), PyMuPDF (`fitz`), OCRmyPDF / Tesseract, ReportLab, OpenPyXL.
- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, Lucide icons, Recharts, Nginx reverse proxy.
- **Deployment:** Docker Compose with isolated network `atc_network`.

## 2. Trust Boundaries & Entry Points
```
[ Untrusted Internet ]
         │ (HTTPS / TLS 1.3)
         ▼
[ Cloudflare Edge WAF & Access ] ── (cf-access-authenticated-user-email, CF-Ray, CF-Connecting-IP)
         │ (HTTP/HTTPS)
         ▼
[ Nginx Reverse Proxy (Frontend Container) ]
         │ (Internal Docker Network: atc_network)
         ▼
[ FastAPI Backend (Port 8000) ]
         │
         ├─── Security Middleware (OWASP ASVS 4.0 / Cloudflare Headers / CSRF X-ATC-Client)
         ├─── Authentication & Session Layer (deps.py: Bearer JWT / Cookie / Cloudflare Access / API Token)
         ├─── REST Endpoints (11 routers: /occurrences, /daily, /dashboards, /documents, /ingest, etc.)
         ├─── Ingestion & Extraction Engine (PyMuPDF, OCRmyPDF, regex parsing)
         ├─── Storage & File System (STORAGE_DIR: /app/storage/uploads)
         └─── Database (PostgreSQL / SQLite via async session)
```

## 3. Threat Surfaces

| Surface | Protocol / Format | Trust Level | Critical Concerns |
| :--- | :--- | :--- | :--- |
| **Public Health & Auth** | HTTP GET/POST | Anonymous Public | DoS, Brute force, Information disclosure |
| **Session Cookie & Bearer** | HTTP + JWT | Authenticated Operator / Admin | Session hijacking, CSRF, Token expiration |
| **Cloudflare Access Header** | HTTP Header (`cf-access-...`) | Semi-trusted (Proxy) | Header spoofing if origin accessed directly without JWT verification |
| **API Ingestion (`/ingest`)** | Multipart PDF / Base64 JSON | Machine-to-Machine (`X-API-Token`) | Malformed PDF exploits (PyMuPDF), DoS (huge files), Disk exhaustion |
| **Report Generation** | PDF (ReportLab), XLSX, CSV | Authenticated User | XML injection in ReportLab, CSV/Formula injection |
| **Webhooks (`/webhooks`)** | HTTP POST out of backend | Admin configured | Server-Side Request Forgery (SSRF) against internal infra |
| **Functional Locations** | REST / Tree recursion | Authenticated User | Infinite recursion, Tree poisoning, DoS |

## 4. Security Controls Present
- Cloudflare header echo (`CF-Ray`, `CF-Connecting-IP`).
- CSRF requirement (`X-ATC-Client: web`) on state-changing methods (`POST`, `PUT`, `DELETE`, `PATCH`).
- Strict HSTS, CSP, X-Frame-Options (`SAMEORIGIN`), X-Content-Type-Options (`nosniff`).
- Two-tier storage sanitation protocol with challenge confirmation (`EXPURGAR`).
- RBAC privilege separation between standard operators and administrators.
