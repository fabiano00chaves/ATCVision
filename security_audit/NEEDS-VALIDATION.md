# Itens que Necessitam Validação em Ambiente de Homologação / Staging

---

### [SEC-CF-06] Chaves Secretas Padrão em Configuração de Produção (CWE-798)
- **Status:** NEEDS_VALIDATION
- **Descrição:**
  Em `backend/app/core/config.py`, as variáveis `JWT_SECRET_KEY` e `MASTER_API_KEY` possuem valores de fallback no código-fonte.
- **Cenário de Risco:**
  Se o ambiente de produção for inicializado via `docker compose up` sem fornecer um arquivo `.env` preenchido com chaves geradas aleatoriamente (`openssl rand -hex 32`), o backend utilizará as chaves padrão fracas.
- **Ação de Validação Recomendada:**
  1. Verificar no servidor de produção (`https://vision.fk.adm.br`) se o arquivo `.env` contém valores únicos e secretos para `JWT_SECRET_KEY` e `MASTER_API_KEY`.
  2. Implementar alerta explícito no startup do FastAPI quando `ENVIRONMENT == "production"` e as chaves padrão forem detectadas.

---

### Validação de Tráfego Direto na Origem (Cloudflare Authenticated Origin Pulls)
- **Status:** NEEDS_VALIDATION
- **Descrição:**
  Para mitigar 100% de qualquer tentativa de bypass do Cloudflare Access na porta da máquina servidora:
  - Configurar no Cloudflare o recurso **Authenticated Origin Pulls** (mTLS entre Cloudflare e o servidor Nginx).
  - Ou configurar regras de firewall no servidor (UFW/iptables/Security Group) liberando tráfego HTTP/HTTPS exclusivamente para os blocos de IP oficiais da Cloudflare (`https://www.cloudflare.com/ips/`).
