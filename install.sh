#!/usr/bin/env bash
# ==============================================================================
# ATC VISION — SCRIPT UNIVERSAL DE INSTALAÇÃO E DEPLOY EM PRODUÇÃO
# Alvo: Proxmox VE (LXC Container Ubuntu Server 24.04 / 26.04 LTS)
# Porta padrão: 8085 (Proxy Reverso Nginx Proxy Manager -> Cloudflare Tunnel)
# ==============================================================================

set -euo pipefail

# Paleta de Cores ANSI
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ------------------------------------------------------------------------------
# 1. VERIFICAÇÃO DE PRIVILÉGIOS ROOT
# ------------------------------------------------------------------------------
if [[ "${EUID}" -ne 0 ]]; then
  echo -e "${RED}[ERRO] Este instalador requer privilégios de superusuário (root).${NC}"
  echo -e "Por favor, execute: ${BOLD}sudo bash $0${NC}"
  exit 1
fi

clear
cat << "EOF"
  █████╗ ████████╗ ██████╗    ██╗   ██╗██╗███████╗██╗ ██████╗ ███╗   ██╗
 ██╔══██╗╚══██╔══╝██╔════╝    ██║   ██║██║██╔════╝██║██╔═══██╗████╗  ██║
 ███████║   ██║   ██║         ██║   ██║██║███████╗██║██║   ██║██╔██╗ ██║
 ██╔══██║   ██║   ██║         ╚██╗ ██╔╝██║╚════██║██║██║   ██║██║╚██╗██║
 ██║  ██║   ██║   ╚██████╗     ╚████╔╝ ██║███████║██║╚██████╔╝██║ ╚████║
 ╚═╝  ╚═╝   ╚═╝    ╚═════╝      ╚═══╝  ╚═╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝
 Sistema Full-Stack de Inteligência e Auditoria Visual SAP PM (Aciaria)
 Produção: https://vision.fk.adm.br | Host Port: 8085
EOF
echo ""
echo -e "${CYAN}==============================================================================${NC}"
echo -e "${BOLD}Iniciando configuração do ambiente ATC Vision no Ubuntu Server...${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo ""

# ------------------------------------------------------------------------------
# 2. DETECÇÃO AUTOMÁTICA DE IP E INTERFACE DE REDE
# ------------------------------------------------------------------------------
DETECTED_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || hostname -I | awk '{print $1}')
if [[ -z "${DETECTED_IP}" ]]; then
  DETECTED_IP="127.0.0.1"
fi

echo -e "${BLUE}[INFO] IP do container detectado:${NC} ${BOLD}${DETECTED_IP}${NC}"

# ------------------------------------------------------------------------------
# 3. PERGUNTAS E PARÂMETROS INTERATIVOS
# ------------------------------------------------------------------------------
INSTALL_DIR="/opt/atc-vision"
read -rp "Diretório de instalação [Padrão: ${INSTALL_DIR}]: " INPUT_DIR
INSTALL_DIR="${INPUT_DIR:-$INSTALL_DIR}"

read -rp "Porta HTTP para exposição no Host [Padrão: 8085]: " INPUT_PORT
HOST_PORT="${INPUT_PORT:-8085}"

read -rp "E-mail do administrador inicial [Padrão: admin@vision.fk.adm.br]: " INPUT_EMAIL
ADMIN_EMAIL="${INPUT_EMAIL:-admin@vision.fk.adm.br}"

while true; do
  echo -ne "Senha do administrador inicial [mínimo 8 caracteres]: "
  read -rs ADMIN_PASS
  echo ""
  if [[ ${#ADMIN_PASS} -ge 8 ]]; then
    break
  else
    echo -e "${YELLOW}[AVISO] A senha deve conter pelo menos 8 caracteres para conformidade de segurança.${NC}"
  fi
done

echo ""
echo -e "${CYAN}--- Configuração do Repositório Git ---${NC}"
echo "1) O código já está no diretório atual ($(pwd))"
echo "2) Clonar repositório Git público"
echo "3) Clonar repositório Git privado (com Token PAT)"
read -rp "Escolha a origem do código [1-3, Padrão 1]: " GIT_MODE
GIT_MODE="${GIT_MODE:-1}"

REPO_URL=""
GIT_PAT=""

if [[ "${GIT_MODE}" == "2" ]]; then
  read -rp "URL do repositório público (ex: https://github.com/org/atc-vision.git): " REPO_URL
elif [[ "${GIT_MODE}" == "3" ]]; then
  read -rp "URL do repositório privado (ex: github.com/org/atc-vision.git): " RAW_REPO_URL
  # Remove protocolo se digitado
  CLEAN_REPO="${RAW_REPO_URL#https://}"
  CLEAN_REPO="${CLEAN_REPO#http://}"
  echo -ne "Personal Access Token (PAT) do Git [oculto]: "
  read -rs GIT_PAT
  echo ""
  REPO_URL="https://${GIT_PAT}@${CLEAN_REPO}"
fi

# ------------------------------------------------------------------------------
# 4. INSTALAÇÃO DE DEPENDÊNCIAS DO SISTEMA
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[1/6] Atualizando pacotes do Ubuntu e instalando Docker...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

apt-get update -qq
apt-get install -y -qq \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  git \
  openssl \
  qpdf \
  poppler-utils

# Instalação do Docker se não presente
if ! command -v docker &> /dev/null; then
  echo -e "${BLUE}[INFO] Instalando Docker CE e Docker Compose Plugin...${NC}"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable --now docker

# ------------------------------------------------------------------------------
# 5. PREPARAÇÃO DO DIRETÓRIO DE INSTALAÇÃO
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[2/6] Preparando diretório ${INSTALL_DIR}...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

mkdir -p "${INSTALL_DIR}"

if [[ "${GIT_MODE}" == "1" ]]; then
  CURRENT_DIR="$(pwd)"
  if [[ "${CURRENT_DIR}" != "${INSTALL_DIR}" ]]; then
    echo -e "${BLUE}[INFO] Copiando arquivos do diretório atual para ${INSTALL_DIR}...${NC}"
    cp -r "${CURRENT_DIR}/." "${INSTALL_DIR}/"
  fi
elif [[ "${GIT_MODE}" == "2" || "${GIT_MODE}" == "3" ]]; then
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    echo -e "${BLUE}[INFO] Repositório existente detectado em ${INSTALL_DIR}. Atualizando (git pull)...${NC}"
    cd "${INSTALL_DIR}"
    git pull
  else
    echo -e "${BLUE}[INFO] Clonando repositório para ${INSTALL_DIR}...${NC}"
    git clone "${REPO_URL}" "${INSTALL_DIR}"
  fi
fi

cd "${INSTALL_DIR}"

# ------------------------------------------------------------------------------
# 6. GERAÇÃO DO ARQUIVO .env COM SEGREDOS CRIPTOGRÁFICOS
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[3/6] Gerando arquivo .env e chaves criptográficas...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20)

cat > "${INSTALL_DIR}/.env" << EOF
# ==============================================================================
# ATC VISION — AMBIENTE DE PRODUÇÃO GERADO AUTOMATICAMENTE
# ==============================================================================
HOST_PORT=${HOST_PORT}

POSTGRES_DB=atc_vision
POSTGRES_USER=atc_user
POSTGRES_PASSWORD=${POSTGRES_PASS}

JWT_SECRET_KEY=${JWT_SECRET}
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440

ADMIN_INITIAL_EMAIL=${ADMIN_EMAIL}
ADMIN_INITIAL_PASSWORD=${ADMIN_PASS}

CORS_ORIGINS=["https://vision.fk.adm.br", "http://localhost:${HOST_PORT}", "http://127.0.0.1:${HOST_PORT}", "http://${DETECTED_IP}:${HOST_PORT}"]

COOKIE_SECURE=true
COOKIE_SAMESITE=lax

MAX_UPLOAD_SIZE_MB=100
STORAGE_DIR=/app/storage
WATCH_FOLDER_PATH=/app/storage/watch
WATCH_FOLDER_INTERVAL_SECONDS=60
OCR_FALLBACK_ENABLED=true
EOF

chmod 600 "${INSTALL_DIR}/.env"
echo -e "${GREEN}[OK] Arquivo .env configurado com permissões restritas (600).${NC}"

# ------------------------------------------------------------------------------
# 7. BUILD E INICIALIZAÇÃO DOS CONTAINERS (DOCKER COMPOSE)
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[4/6] Compilando imagens Docker e inicializando contêineres...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

docker compose down --remove-orphans 2>/dev/null || true
docker compose build
docker compose up -d

# ------------------------------------------------------------------------------
# 8. EXECUÇÃO DE MIGRAÇÕES DO BANCO DE DADOS
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[5/6] Aguardando banco de dados e executando migrações Alembic...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

echo -ne "${BLUE}[INFO] Aguardando o PostgreSQL inicializar...${NC}"
for i in {1..30}; do
  if docker compose exec -T db pg_isready -U atc_user -d atc_vision > /dev/null 2>&1; then
    echo -e " ${GREEN}[Conectado!]${NC}"
    break
  fi
  echo -ne "."
  sleep 1
done

echo -e "${BLUE}[INFO] Executando migrações do schema de dados...${NC}"
docker compose exec -T backend alembic upgrade head
echo -e "${GREEN}[OK] Migrações concluídas com sucesso!${NC}"

# ------------------------------------------------------------------------------
# 9. INSTALAÇÃO DO SERVIÇO SYSTEMD (INICIALIZAÇÃO NO BOOT)
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[6/6] Criando serviço systemd atc-vision.service...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

cat > /etc/systemd/system/atc-vision.service << EOF
[Unit]
Description=ATC Vision Full-Stack Suite (Docker Compose)
Requires=docker.service
After=docker.service network.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable atc-vision.service
echo -e "${GREEN}[OK] Serviço systemd atc-vision habilitado para boot automático no Proxmox LXC.${NC}"

# ------------------------------------------------------------------------------
# 10. RELATÓRIO FINAL E MANUAL DO NGINX PROXY MANAGER (NPM)
# ------------------------------------------------------------------------------
clear
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${BOLD}${GREEN}✔ ATC VISION INSTALADO E INICIALIZADO COM SUCESSO!${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo ""
echo -e "${BOLD}INFORMAÇÕES DE ACESSO LOCAL / REDE INTERNA:${NC}"
echo -e "  • URL Direta:       ${CYAN}http://${DETECTED_IP}:${HOST_PORT}${NC}"
echo -e "  • URL Pública:      ${CYAN}https://vision.fk.adm.br${NC}"
echo -e "  • E-mail Admin:     ${BOLD}${ADMIN_EMAIL}${NC}"
echo -e "  • Senha Admin:      ${YELLOW}${ADMIN_PASS}${NC}"
echo ""
echo -e "${BOLD}DIRETÓRIOS E VOLUMES DO SISTEMA:${NC}"
echo -e "  • Raiz da Aplicação:${CYAN} ${INSTALL_DIR}${NC}"
echo -e "  • Pasta Monitorada: ${CYAN} /var/lib/docker/volumes/atc_vision_storage/_data/watch${NC}"
echo -e "  • Arquivo de Conf:  ${CYAN} ${INSTALL_DIR}/.env${NC}"
echo ""
echo -e "${CYAN}==============================================================================${NC}"
echo -e "${BOLD}GUIA DE CONFIGURAÇÃO NO NGINX PROXY MANAGER (NPM):${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo -e "No seu painel do Nginx Proxy Manager, adicione um novo ${BOLD}Proxy Host${NC}:"
echo ""
echo -e "  ${BOLD}Aba 'Details':${NC}"
echo -e "    - Domain Names:          ${CYAN}vision.fk.adm.br${NC}"
echo -e "    - Scheme:                ${CYAN}http${NC}"
echo -e "    - Forward Hostname / IP: ${CYAN}${DETECTED_IP}${NC}"
echo -e "    - Forward Port:          ${CYAN}${HOST_PORT}${NC}"
echo -e "    - Cache Assets:          ${YELLOW}DESMARCADO${NC} (O Nginx interno gerencia caches por hash)"
echo -e "    - Block Common Exploits: ${GREEN}MARCADO [X]${NC}"
echo -e "    - Websockets Support:    ${GREEN}MARCADO [X]${NC}"
echo ""
echo -e "  ${BOLD}Aba 'SSL':${NC}"
echo -e "    - SSL Certificate:       ${CYAN}Certificado Cloudflare (*.fk.adm.br) ou Let's Encrypt${NC}"
echo -e "    - Force SSL:             ${GREEN}MARCADO [X]${NC}"
echo -e "    - HTTP/2 Support:        ${GREEN}MARCADO [X]${NC}"
echo -e "    - HSTS Enabled:          ${GREEN}MARCADO [X]${NC}"
echo ""
echo -e "  ${BOLD}Aba 'Advanced' (Custom Nginx Configuration):${NC}"
echo -e "  Cole o bloco abaixo para autorizar uploads de PDFs pesados e prevenir timeouts:"
echo ""
echo -e "${YELLOW}------------------------------------------------------------------------------${NC}"
cat << 'NPMSNIP'
client_max_body_size 100M;
proxy_read_timeout 300s;
proxy_connect_timeout 60s;
proxy_send_timeout 300s;
proxy_set_header X-Forwarded-Proto https;
NPMSNIP
echo -e "${YELLOW}------------------------------------------------------------------------------${NC}"
echo ""
echo -e "${BOLD}Comandos úteis de manutenção:${NC}"
echo -e "  • Ver logs:         ${CYAN}cd ${INSTALL_DIR} && docker compose logs -f${NC}"
echo -e "  • Reiniciar tudo:   ${CYAN}systemctl restart atc-vision${NC}"
echo -e "  • Inspecionar status:${CYAN}docker compose ps${NC}"
echo ""
echo -e "${GREEN}Deploy concluído! Acesse o painel e bom trabalho.${NC}"
EOF
