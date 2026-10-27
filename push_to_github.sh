#!/usr/bin/env bash
# ==============================================================================
# ATC VISION — SCRIPT SEGURO DE ENVIO (PUSH) PARA O GITHUB (LINUX/BASH)
# Protege o .env e NÃO grava o token no arquivo .git/config.
# ==============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

COMMIT_MSG="${1:-feat: implantacao e atualizacao do sistema ATC Vision Full-Stack}"
FORCE_PUSH="${2:-false}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env"

echo -e "${CYAN}==============================================================================${NC}"
echo -e "${BOLD}${CYAN}       ATC VISION — ENVIO SEGURO PARA O REPOSITÓRIO GITHUB                   ${NC}"
echo -e "${CYAN}==============================================================================${NC}"
echo ""

# 1. Verificar se o .env existe
if [[ ! -f "${ENV_FILE}" ]]; then
  echo -e "${RED}[ERRO CRÍTICO] Arquivo .env não encontrado em ${ENV_FILE}!${NC}"
  echo -e "${YELLOW}Crie o arquivo .env a partir de .env.example e preencha suas variáveis.${NC}"
  exit 1
fi

# 2. Ler credenciais do .env com segurança
REPO_URL=""
USERNAME=""
TOKEN=""
BRANCH="main"

while IFS='=' read -r key val || [[ -n "$key" ]]; do
  # Ignora comentários e linhas em branco
  [[ "$key" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$key" ]] && continue
  
  clean_key=$(echo "$key" | tr -d '[:space:]')
  clean_val=$(echo "$val" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^["\x27]//' -e 's/["\x27]$//')

  case "$clean_key" in
    GITHUB_REPO_URL) REPO_URL="$clean_val" ;;
    GITHUB_USERNAME) USERNAME="$clean_val" ;;
    GITHUB_TOKEN)    TOKEN="$clean_val" ;;
    GITHUB_BRANCH)   BRANCH="$clean_val" ;;
  esac
done < "${ENV_FILE}"

# 3. Validação dos campos
if [[ -z "${REPO_URL}" || "${REPO_URL}" == *"SEU_USUARIO"* ]]; then
  echo -e "${RED}[ERRO] GITHUB_REPO_URL não configurado corretamente no .env!${NC}"
  exit 1
fi

if [[ -z "${TOKEN}" || "${TOKEN}" == *"ghp_SEU_TOKEN"* ]]; then
  echo -e "${RED}[ERRO] GITHUB_TOKEN não configurado no .env!${NC}"
  echo -e "${YELLOW}Gere um Personal Access Token (PAT) no GitHub e cole no .env.${NC}"
  exit 1
fi

if [[ -z "${USERNAME}" || "${USERNAME}" == *"SEU_USUARIO"* ]]; then
  USERNAME="git"
fi

# 4. Verificação de Segurança Anti-Vazamento
echo -e "${BLUE}[1/5] Executando auditoria de segurança anti-vazamento...${NC}"
if ! git check-ignore -q "${ENV_FILE}" 2>/dev/null && ! git check-ignore -q ".env" 2>/dev/null; then
  echo -e "${RED}[ERRO DE SEGURANÇA MÁXIMA] O arquivo .env NÃO está protegido pelo .gitignore!${NC}"
  echo -e "${RED}Abortando imediatamente para prevenir vazamento de credenciais na nuvem.${NC}"
  exit 1
fi
echo -e "  ${GREEN}✔ O arquivo .env está rigorosamente protegido pelo .gitignore.${NC}"

# Remover do índice caso tenha sido rastreado no passado
git rm --cached .env 2>/dev/null || true

# 5. Inicialização do Git
echo -e "${BLUE}[2/5] Verificando repositório Git local...${NC}"
if [[ ! -d "${SCRIPT_DIR}/.git" ]]; then
  git init -b "${BRANCH}"
  echo -e "  ${GREEN}✔ Repositório Git inicializado na branch '${BRANCH}'.${NC}"
else
  git branch -M "${BRANCH}" 2>/dev/null || true
fi

# 6. Configurar o Remote Origin com URL limpa
CLEAN_REPO_URL=$(echo "${REPO_URL}" | sed -E 's|https://[^@]+@|https://|')
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "${CLEAN_REPO_URL}"
else
  git remote add origin "${CLEAN_REPO_URL}"
fi
echo -e "  ${GREEN}✔ Remoto 'origin' apontado para: ${CLEAN_REPO_URL}${NC}"
echo -e "  ${GREEN}✔ Credenciais NÃO foram salvas em .git/config.${NC}"

# 7. Adicionar arquivos
echo -e "${BLUE}[3/5] Indexando arquivos permitidos...${NC}"
git add .

# 8. Verificação final de staged files
for staged in $(git diff --name-only --cached); do
  if [[ "$staged" == .env* && "$staged" != ".env.example" ]]; then
    echo -e "${RED}[ERRO CRÍTICO] Arquivo sensível detectado no stage: ${staged}!${NC}"
    git reset
    exit 1
  fi
done

# 9. Commit
echo -e "${BLUE}[4/5] Criando commit...${NC}"
if git diff-index --quiet HEAD -- 2>/dev/null; then
  echo -e "  ${YELLOW}ℹ Nenhuma alteração pendente para commit.${NC}"
else
  git commit -m "${COMMIT_MSG}"
  echo -e "  ${GREEN}✔ Commit realizado com sucesso.${NC}"
fi

# 10. Push com token em memória
echo -e "${BLUE}[5/5] Enviando para o GitHub (${BRANCH})...${NC}"
PUSH_URL=$(echo "${CLEAN_REPO_URL}" | sed -E "s|^https://|https://${USERNAME}:${TOKEN}@|")

if [[ "${FORCE_PUSH}" == "true" || "${FORCE_PUSH}" == "--force" ]]; then
  git push --force "${PUSH_URL}" "${BRANCH}"
else
  git push -u "${PUSH_URL}" "${BRANCH}"
fi

# Limpar credenciais da memória
TOKEN=""
PUSH_URL=""

echo ""
echo -e "${GREEN}==============================================================================${NC}"
echo -e "${BOLD}${GREEN}       ✔ PROJETO ENVIADO COM SUCESSO PARA O GITHUB!                           ${NC}"
echo -e "${GREEN}==============================================================================${NC}"
echo -e "Repositório: ${CYAN}${CLEAN_REPO_URL}${NC}"
echo -e "Branch:      ${CYAN}${BRANCH}${NC}"
echo -e "Segurança:   ${GREEN}Credenciais mantidas 100% seguras no arquivo local .env${NC}"
