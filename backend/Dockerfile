# ==============================================================================
# ATC Vision — Backend Dockerfile
# Ubuntu / Debian Slim with Python 3.12 + Tesseract OCR + PyMuPDF + OCRmyPDF
# ==============================================================================

FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    TZ=America/Sao_Paulo

WORKDIR /app

# Install system dependencies including Tesseract Portuguese/English and OCRmyPDF tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libpq-dev \
    libpq5 \
    poppler-utils \
    qpdf \
    tesseract-ocr \
    tesseract-ocr-por \
    tesseract-ocr-eng \
    ocrmypdf \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code and migrations
COPY . .

# Create storage directories for PDFs, reports, and watch folder
RUN mkdir -p /app/storage/pdfs /app/storage/watch /app/storage/reports

# Run as non-root user for DevSecOps best practices
RUN groupadd -g 10001 atc && \
    useradd -u 10001 -g atc -s /bin/bash -m atc && \
    chown -R atc:atc /app

USER atc

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:8000/api/v1/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
