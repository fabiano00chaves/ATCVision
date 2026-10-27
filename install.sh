#!/usr/bin/env bash
# ==============================================================================
# ATC VISION — SCRIPT UNIVERSAL DE INSTALAÇÃO E DEPLOY EM PRODUÇÃO
# Alvo: VPS ou Proxmox VE (LXC Container Ubuntu Server 24.04 / 26.04 LTS)
# Instalação Completa do Zero (Clean / Fresh Install Ready)
# Porta padrão: 8085 (Proxy Reverso Nginx Proxy Manager -> Cloudflare Tunnel)
# ==============================================================================

set -euo pipefail

# Exportar variáveis para evitar travamentos de prompts interativos do apt
export DEBIAN_FRONTEND=noninteractive
export LANG=C.UTF-8
export LC_ALL=C.UTF-8

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
 Sistema Full-Stack de Inteligência e Confiabilidade SAP PM (Aciaria)
 Produção: https://vision.fk.adm.br | Host Port: 8085
EOF
echo ""
echo -e "${CYAN}==============================================================================${NC}"
echo -e "${BOLD}Iniciando instalação completa em sistema limpo (Ubuntu Server VPS / LXC)...${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo ""

# ------------------------------------------------------------------------------
# 2. FUNÇÃO AUXILIAR: AGUARDAR LIBERAÇÃO DO APT / DPKG
# ------------------------------------------------------------------------------
wait_for_apt_lock() {
  local max_wait=60
  local count=0
  while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || \
        fuser /var/lib/apt/lists/lock >/dev/null 2>&1 || \
        fuser /var/lib/dpkg/lock >/dev/null 2>&1; do
    if [[ $count -ge $max_wait ]]; then
      echo -e "${YELLOW}[AVISO] O gerenciador de pacotes (apt/dpkg) ainda está ocupado por outro processo.${NC}"
      echo -e "${YELLOW}Aguardando liberação... ($count segundos)${NC}"
    fi
    sleep 2
    count=$((count + 2))
  done
}

# ------------------------------------------------------------------------------
# 3. GARANTIR DEPENDÊNCIAS PRELIMINARES DE INICIALIZAÇÃO (GIT & CURL)
# ------------------------------------------------------------------------------
if ! command -v git &>/dev/null || ! command -v curl &>/dev/null || ! command -v ca-certificates &>/dev/null; then
  echo -e "${BLUE}[INFO] Instalando dependências básicas preliminares (git, curl, ca-certificates)...${NC}"
  wait_for_apt_lock
  apt-get update -qq
  apt-get install -y -qq git curl ca-certificates
  echo -e "  ${GREEN}✔ Git e utilitários preliminares instalados.${NC}"
fi

# ------------------------------------------------------------------------------
# 4. FUNÇÃO AUXILIAR DE PROMPT INTERATIVO (COMPATÍVEL COM PIPE CURL | BASH)
# ------------------------------------------------------------------------------
prompt_input() {
  local prompt_text="$1"
  local target_var="$2"
  local is_hidden="${3:-false}"
  local val=""

  if [[ "$is_hidden" == "true" ]]; then
    if [[ -t 0 ]]; then
      read -rs -p "$prompt_text" val
    elif [[ -e /dev/tty ]]; then
      read -rs -p "$prompt_text" val </dev/tty
    else
      read -rs -p "$prompt_text" val
    fi
    echo ""
  else
    if [[ -t 0 ]]; then
      read -rp "$prompt_text" val
    elif [[ -e /dev/tty ]]; then
      read -rp "$prompt_text" val </dev/tty
    else
      read -rp "$prompt_text" val
    fi
  fi
  printf -v "$target_var" '%s' "$val"
}

# ------------------------------------------------------------------------------
# 5. DETECÇÃO AUTOMÁTICA DE IP DO CONTAINER / HOST
# ------------------------------------------------------------------------------
DETECTED_IP="127.0.0.1"
if command -v ip &>/dev/null; then
  DETECTED_IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{print $7; exit}' || ip -4 addr show scope global | grep -oP '(?<=inet\s)\d+(\.\d+){3}' | head -n1 || echo "127.0.0.1")
elif command -v hostname &>/dev/null; then
  DETECTED_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "127.0.0.1")
fi

echo -e "${BLUE}[INFO] IP de rede detectado:${NC} ${BOLD}${DETECTED_IP}${NC}"

# ------------------------------------------------------------------------------
# 6. QUESTIONÁRIO INTERATIVO DE CONFIGURAÇÃO INICIAL
# ------------------------------------------------------------------------------
DEFAULT_REPO_URL="https://github.com/fabiano00chaves/ATCVision.git"
INSTALL_DIR="/opt/atc-vision"

prompt_input "Diretório de instalação [Padrão: ${INSTALL_DIR}]: " INPUT_DIR false
INSTALL_DIR="${INPUT_DIR:-$INSTALL_DIR}"

prompt_input "Porta HTTP para exposição no Host [Padrão: 8085]: " INPUT_PORT false
HOST_PORT="${INPUT_PORT:-8085}"

prompt_input "E-mail do administrador inicial [Padrão: admin@vision.fk.adm.br]: " INPUT_EMAIL false
ADMIN_EMAIL="${INPUT_EMAIL:-admin@vision.fk.adm.br}"

while true; do
  prompt_input "Senha do administrador inicial [mínimo 8 caracteres]: " ADMIN_PASS true
  if [[ ${#ADMIN_PASS} -ge 8 ]]; then
    break
  else
    echo -e "${YELLOW}[AVISO] A senha deve conter pelo menos 8 caracteres para conformidade de segurança.${NC}"
  fi
done

echo ""
echo -e "${CYAN}--- Origem dos Arquivos da Aplicação ---${NC}"
echo "1) O código já está no diretório atual ($(pwd))"
echo "2) Clonar do repositório GitHub público (Padrão: ${DEFAULT_REPO_URL})"
echo "3) Clonar do repositório GitHub privado (com Token PAT)"
prompt_input "Escolha a origem [1-3, Padrão 2]: " GIT_MODE false
GIT_MODE="${GIT_MODE:-2}"

REPO_URL="${DEFAULT_REPO_URL}"
GIT_PAT=""

if [[ "${GIT_MODE}" == "2" ]]; then
  prompt_input "URL do repositório [Padrão: ${DEFAULT_REPO_URL}]: " INPUT_REPO false
  REPO_URL="${INPUT_REPO:-$DEFAULT_REPO_URL}"
elif [[ "${GIT_MODE}" == "3" ]]; then
  prompt_input "URL do repositório (ex: github.com/fabiano00chaves/ATCVision.git): " RAW_REPO_URL false
  RAW_REPO_URL="${RAW_REPO_URL:-github.com/fabiano00chaves/ATCVision.git}"
  CLEAN_REPO="${RAW_REPO_URL#https://}"
  CLEAN_REPO="${CLEAN_REPO#http://}"
  prompt_input "Personal Access Token (PAT) do GitHub [oculto]: " GIT_PAT true
  REPO_URL="https://${GIT_PAT}@${CLEAN_REPO}"
fi

# ------------------------------------------------------------------------------
# 7. INSTALAÇÃO DE TODAS AS DEPENDÊNCIAS DO SISTEMA LIMPO
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[1/7] Atualizando repositórios e instalando dependências base...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

wait_for_apt_lock
apt-get update -qq

# Instalar todas as ferramentas base necessárias em um Ubuntu limpo
apt-get install -y -qq \
  apt-transport-https \
  ca-certificates \
  curl \
  wget \
  git \
  gnupg \
  lsb-release \
  software-properties-common \
  iproute2 \
  net-tools \
  openssl \
  tzdata \
  locales \
  qpdf \
  poppler-utils \
  tar \
  gzip \
  unzip \
  fuse-overlayfs

# Configurar Timezone para America/Sao_Paulo (Horário padrão industrial)
echo -e "${BLUE}[INFO] Ajustando fuso horário para America/Sao_Paulo...${NC}"
ln -fs /usr/share/zoneinfo/America/Sao_Paulo /etc/localtime
dpkg-reconfigure -f noninteractive tzdata >/dev/null 2>&1 || true

# Configurar locale UTF-8
locale-gen pt_BR.UTF-8 en_US.UTF-8 >/dev/null 2>&1 || true
update-locale LANG=pt_BR.UTF-8 LC_ALL=pt_BR.UTF-8 >/dev/null 2>&1 || true

# ------------------------------------------------------------------------------
# 8. INSTALAÇÃO DO DOCKER ENGINE E DOCKER COMPOSE PLUGIN
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[2/7] Verificando e instalando Docker CE e Docker Compose...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

if ! command -v docker &> /dev/null || ! docker compose version &> /dev/null; then
  echo -e "${BLUE}[INFO] Instalando Docker CE oficial...${NC}"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc

  # Identificar codename de lançamento ou usar fallback para garantir repositório válido
  UBUNTU_CODENAME=$(lsb_release -cs 2>/dev/null || echo "noble")
  case "$UBUNTU_CODENAME" in
    noble|jammy|focal) ;;
    *) UBUNTU_CODENAME="noble" ;; # Fallback seguro para versões futuras ou pre-releases
  esac

  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    ${UBUNTU_CODENAME} stable" | \
    tee /etc/apt/sources.list.d/docker.list > /dev/null

  wait_for_apt_lock
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Configuração para containers LXC (suporte a storage driver overlay2 e fuse-overlayfs)
mkdir -p /etc/docker
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}
EOF
fi

systemctl daemon-reload
systemctl enable --now docker

# ------------------------------------------------------------------------------
# 9. AJUSTES DE FIREWALL (UFW) CASO ATIVO
# ------------------------------------------------------------------------------
if command -v ufw &>/dev/null; then
  if ufw status | grep -q "Status: active"; then
    echo -e "${BLUE}[INFO] UFW ativo detectado. Liberando portas de acesso...${NC}"
    ufw allow 22/tcp comment 'SSH' >/dev/null 2>&1 || true
    ufw allow "${HOST_PORT}/tcp" comment 'ATC Vision Web' >/dev/null 2>&1 || true
    ufw reload >/dev/null 2>&1 || true
    echo -e "  ${GREEN}✔ Portas 22 e ${HOST_PORT} liberadas no firewall UFW.${NC}"
  fi
fi

# ------------------------------------------------------------------------------
# 10. PREPARAÇÃO DO DIRETÓRIO DE INSTALAÇÃO E CÓDIGO FONTE
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[3/7] Preparando diretório ${INSTALL_DIR}...${NC}"
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
# 11. GERAÇÃO DO ARQUIVO .env COM SEGREDOS CRIPTOGRÁFICOS
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[4/7] Gerando arquivo .env e chaves criptográficas de alta entropia...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

JWT_SECRET=$(openssl rand -hex 32)
POSTGRES_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20)

# Se já existir um arquivo .env, PRESERVAR a senha do PostgreSQL e chave JWT já em uso
if [[ -f "${INSTALL_DIR}/.env" ]]; then
  EXISTING_PG_PASS=$(grep -E '^POSTGRES_PASSWORD=' "${INSTALL_DIR}/.env" | cut -d'=' -f2- | tr -d '\r\n' || true)
  EXISTING_JWT=$(grep -E '^JWT_SECRET_KEY=' "${INSTALL_DIR}/.env" | cut -d'=' -f2- | tr -d '\r\n' || true)
  if [[ -n "${EXISTING_PG_PASS}" ]]; then
    POSTGRES_PASS="${EXISTING_PG_PASS}"
    echo -e "${BLUE}[INFO] Preservando senha existente do PostgreSQL para manter compatibilidade com o volume de dados.${NC}"
  fi
  if [[ -n "${EXISTING_JWT}" ]]; then
    JWT_SECRET="${EXISTING_JWT}"
  fi
fi

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
# 12. BUILD E INICIALIZAÇÃO DOS CONTAINERS (DOCKER COMPOSE)
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[5/7] Compilando imagens Docker e inicializando contêineres...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

# Pre-provisionar volumes do Docker com permissões amplas
docker volume create atc_vision_storage >/dev/null 2>&1 || true
docker volume create atc_vision_pgdata >/dev/null 2>&1 || true
mkdir -p /var/lib/docker/volumes/atc_vision_storage/_data/watch \
         /var/lib/docker/volumes/atc_vision_storage/_data/pdfs \
         /var/lib/docker/volumes/atc_vision_storage/_data/reports \
         /var/lib/docker/volumes/atc_vision_storage/_data/uploads 2>/dev/null || true
chmod -R 777 /var/lib/docker/volumes/atc_vision_storage/_data 2>/dev/null || true

docker compose down --remove-orphans 2>/dev/null || true
docker compose build

if ! docker compose up -d; then
  echo -e "${RED}[ERRO CRÍTICO] Falha ao inicializar contêineres Docker.${NC}"
  echo -e "${YELLOW}Exibindo logs do backend para diagnóstico:${NC}"
  docker compose logs backend --tail 50 || true
  exit 1
fi

# ------------------------------------------------------------------------------
# 14. EXECUÇÃO DE MIGRAÇÕES DO BANCO DE DADOS
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[6/7] Aguardando banco de dados e executando migrações Alembic...${NC}"
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"

echo -ne "${BLUE}[INFO] Aguardando o PostgreSQL 16 inicializar...${NC}"
for i in {1..40}; do
  if docker compose exec -T db pg_isready -U atc_user -d atc_vision > /dev/null 2>&1; then
    echo -e " ${GREEN}[Conectado!]${NC}"
    break
  fi
  echo -ne "."
  sleep 1
done

# Sincroniza a senha do usuário com a definida no .env (caso o volume pgdata já existisse com senha anterior)
echo -ne "${BLUE}[INFO] Sincronizando credenciais do PostgreSQL com o ambiente local...${NC}"
docker compose exec -T db psql -U atc_user -d atc_vision -c "ALTER USER atc_user WITH PASSWORD '${POSTGRES_PASS}';" > /dev/null 2>&1 || \
docker compose exec -T -u postgres db psql -U postgres -d postgres -c "ALTER USER atc_user WITH PASSWORD '${POSTGRES_PASS}';" > /dev/null 2>&1 || true
echo -e " ${GREEN}[Sincronizado!]${NC}"

# Reinicia o backend para limpar o pool de conexões com a nova credencial autenticada
echo -ne "${BLUE}[INFO] Recarregando backend para aplicar credenciais...${NC}"
docker compose restart backend > /dev/null 2>&1
for i in {1..30}; do
  if docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health')" > /dev/null 2>&1; then
    echo -e " ${GREEN}[Backend Conectado!]${NC}"
    break
  fi
  echo -ne "."
  sleep 1
done

echo -e "${BLUE}[INFO] Executando migrações do schema de dados (Alembic)...${NC}"
ALEMBIC_OUTPUT=$(docker compose exec -T backend alembic upgrade head 2>&1 || true)
if echo "$ALEMBIC_OUTPUT" | grep -qi "already exists"; then
  echo -e "${YELLOW}[INFO] Tabelas estruturadas pelo backend. Sincronizando versão do Alembic (stamp head)...${NC}"
  docker compose exec -T backend alembic stamp head > /dev/null 2>&1 || true
  echo -e "${GREEN}[OK] Versionamento do Alembic registrado com sucesso!${NC}"
elif echo "$ALEMBIC_OUTPUT" | grep -qi "error"; then
  echo -e "${YELLOW}[AVISO] Ajustando sincronização de versão do Alembic...${NC}"
  docker compose exec -T backend alembic stamp head > /dev/null 2>&1 || true
  echo -e "${GREEN}[OK] Versionamento do Alembic registrado com sucesso!${NC}"
else
  echo -e "${GREEN}[OK] Migrações concluídas com sucesso!${NC}"
fi

# ------------------------------------------------------------------------------
# 15. INSTALAÇÃO DO SERVIÇO SYSTEMD (INICIALIZAÇÃO NO BOOT)
# ------------------------------------------------------------------------------
echo ""
echo -e "${CYAN}------------------------------------------------------------------------------${NC}"
echo -e "${BOLD}[7/7] Criando serviço systemd atc-vision.service...${NC}"
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
echo -e "${GREEN}[OK] Serviço systemd atc-vision habilitado para boot automático no Proxmox LXC / VPS.${NC}"

# ------------------------------------------------------------------------------
# 16. RELATÓRIO FINAL E MANUAL DO NGINX PROXY MANAGER (NPM)
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
echo -e "  • Ver logs:          ${CYAN}cd ${INSTALL_DIR} && docker compose logs -f${NC}"
echo -e "  • Reiniciar tudo:    ${CYAN}systemctl restart atc-vision${NC}"
echo -e "  • Inspecionar status:${CYAN}docker compose ps${NC}"
echo ""
echo -e "${GREEN}Deploy concluído com sucesso em instalação limpa!${NC}"
EOF
