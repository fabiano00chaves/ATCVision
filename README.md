# ATC Vision (`vision.fk.adm.br`)

**Sistema Web Full-Stack de Inteligência, Auditoria Visual Lado a Lado e Gestão de Confiabilidade para Relatórios SAP Manutenção (SAP PM)**

---

## 1. Visão Geral da Arquitetura

O **ATC Vision** é uma solução de engenharia e auditoria industrial concebida para processar e analisar relatórios de turno gerados pelo **SAP Manutenção (SAP PM)** na Aciaria e áreas industriais.

A plataforma resolve o desafio crítico de perdas de dados em quebras de página nos PDFs do SAP, mapeia as coordenadas espaciais exatas (`Bounding Boxes`) de cada informação para auditoria visual lado a lado com o PDF original, executa OCR híbrido automático quando necessário e disponibiliza um ecossistema completo de confiabilidade industrial (Bad Actors, Jumps/Forces, Modos de Falha e MTTR) e gerador executivo de relatórios.

```
                                  [ Cloudflare Tunnel / DNS ]
                                               │
                                               ▼
                             [ Nginx Proxy Manager (LXC Proxy) ]
                                               │
                             [ Proxy HTTP na porta 8085 ]
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ Proxmox LXC Container (Ubuntu Server 26.04 LTS) — /opt/atc-vision           │
│                                                                             │
│  ┌──────────────────────┐    ┌──────────────────────┐    ┌───────────────┐  │
│  │ atc-vision-frontend  │───▶│  atc-vision-backend  │───▶│ atc-vision-db │  │
│  │ (Nginx 1.27 + React) │    │ (FastAPI + PyMuPDF)  │    │ (Postgres 16) │  │
│  │ Porta 8080 (Host 8085│    │ Porta 8000 interna   │    │ Porta 5432    │  │
│  └──────────────────────┘    └──────────────────────┘    └───────────────┘  │
│                                      │                                      │
│                                      ▼                                      │
│                     ┌─────────────────────────────────┐                     │
│                     │ Volume Docker: atc_vision_storage│                    │
│                     │  • /pdfs (PDFs arquivados)      │                     │
│                     │  • /watch (Pasta monitorada)    │                     │
│                     │  • /reports (Relatórios gerados)│                     │
│                     └─────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Stack Tecnológica

* **Infraestrutura Host:** Container LXC Proxmox VE rodando **Ubuntu Server 26.04 LTS**.
* **Roteamento & Borda:** Cloudflare Tunnel + Nginx Proxy Manager (NPM) -> Porta Host `8085`.
* **Backend:** Python 3.12, **FastAPI**, **SQLAlchemy 2.0 (Async)**, **Pydantic v2**, **Alembic**.
* **Motor de Extração & OCR:** **PyMuPDF (`pymupdf`/`fitz`)** para extração de vetores e coordenadas + **OCRmyPDF** com **Tesseract OCR** (`por` + `eng`) para fallback automático de PDFs rasterizados/escaneados.
* **Banco de Dados:** **PostgreSQL 16** com extensões `pg_trgm` (trigramas) e `unaccent` para busca textual tolerante a erros e acentos.
* **Frontend:** **React 19**, **TypeScript**, **Vite**, **TailwindCSS v4**, **shadcn/ui**, **Lucide Icons**, **react-pdf (PDF.js)** com camada de Canvas Bounding Boxes interativa e **Recharts**.
* **Segurança:** Autenticação JWT via cookies `HttpOnly` / `SameSite=Lax` / `Secure`, hashing com `Argon2id`, proteção CSRF com cabeçalho obrigatório `X-ATC-Client: web` e tokens com prefixo mascarado (`atc_...`).

---

## 3. Motor Core de Extração SAP PM (`pdf_extractor.py`)

### 3.1. Costura de Quebras de Página (*Page-Break Stitching*)
1. Converte spans do PyMuPDF em `LineToken(text, page_number, bbox=(x0, y0, x1, y1))` com offsets de caracteres para mapeamento reverso substring -> retângulo na página.
2. Remove cabeçalhos de topo da página 1 (`ArcelorMittal`, carimbo de emissão, `Relatório de turno`).
3. Remove rodapés de paginação em cada página (`^\d{1,2}\s*/\s*\d{1,2}$` ou números em linhas consecutivas).
4. Remove cabeçalhos de tabela repetidos em quebras de página (`Lista de objetos`).
5. Concatena os tokens em um fluxo contínuo. Textos que cruzam a quebra de página mantêm coordenadas de ambas as páginas: `source_locations: [{"page": 1, "bbox": [...]}, {"page": 2, "bbox": [...]}]`.

### 3.2. As 4 Variações de Registro do SAP PM
1. **Manutenção Corretiva (`Manut. Corr.-Mau func`):** Prioridade Imediato, Nota (`900005...`) e Ordem (`900039...`).
2. **Notificação Geral (`Notificação geral`):** Prioridade Geral, Ordem administrativa, suporta a regra de borda onde o número da nota é impresso uma linha **acima** do marcador.
3. **Preventiva Condicional (`Bas. Co` / `Manut. Prev.`):** Contém Nota e Ordem, checklist de Regras de Ouro e múltiplas operações (`0010`, `0020`, `0030`).
4. **Preventiva por Tempo/Contador (`Manut Prev (tempo/contador)`):** Não possui nota, usa `Data de início`, `Hora de início` e `Centro de trabalho`.

### 3.3. Sanitizações e Normalizações Industriais
* **Número de ordem com ponto:** `90003949961.0` -> `900039499610`.
* **Correção de prefixos OCR na Posição Funcional:**
  * `BT-ST-COMO` -> `BT-ST-COM0`
  * `BT-ST-CCSO` -> `BT-ST-CCS0`
  * `BT-ST-CCSI` -> `BT-ST-CCS1`
  * `BT-ST-SLMI` -> `BT-ST-SLM1`
  * `BT-ST-BOFI` -> `BT-ST-BOF1`
  * `BT-ST-PCCI` -> `BT-ST-PCC1`
* **Grupo de Planejamento:** Normaliza `058/ ATOO`, `184/ AT0O`, etc. para `058/AT00`, `184/AT00`.
* **Identificação de Jumps / Forces:** Detecta palavras-chave em tarefas e confirmações (`jump`, `jumper`, `force`, `bypass`, `bloqueio lógico`, `desabilitado temporariamente`).
* **Desduplicação Inteligente (Upsert):** Atualiza status e confirmações sem perder notas do ATC, flags `Analisar`, `Relevante` ou comentários existentes.

---

## 4. Instalação e Deploy em Produção (Ubuntu Server 26.04 LTS)

### 4.1. Instalação Automatizada com `install.sh`

No container LXC Proxmox:

```bash
# Clone ou transfira os arquivos para o container:
git clone <URL_DO_REPOSITORIO> /opt/atc-vision
cd /opt/atc-vision

# Execute o instalador interativo como root:
sudo bash install.sh
```

O instalador realiza automaticamente:
1. Instalação do Docker CE e Docker Compose plugin.
2. Geração do arquivo `.env` com chaves criptográficas (`openssl rand -hex 32`).
3. Build e subida dos contêineres Docker.
4. Execução das migrações Alembic no PostgreSQL 16.
5. Criação do serviço `atc-vision.service` no systemd para inicialização automática no boot.
6. Apresentação do relatório final com os parâmetros para o Nginx Proxy Manager.

---

## 5. Configuração no Nginx Proxy Manager (NPM)

No painel do Nginx Proxy Manager que gerencia o domínio `vision.fk.adm.br`:

1. **Details:**
   * **Domain Names:** `vision.fk.adm.br`
   * **Scheme:** `http`
   * **Forward Hostname / IP:** `<IP_DO_LXC_ATC_VISION>`
   * **Forward Port:** `8085`
   * **Cache Assets:** Desmarcado
   * **Block Common Exploits:** Marcado
   * **Websockets Support:** Marcado
2. **SSL:**
   * **SSL Certificate:** Certificado Cloudflare Origin (`*.fk.adm.br`) ou Let's Encrypt
   * **Force SSL:** Marcado
   * **HTTP/2 Support:** Marcado
   * **HSTS Enabled:** Marcado
3. **Advanced (Custom Nginx Configuration):**
   ```nginx
   client_max_body_size 100M;
   proxy_read_timeout 300s;
   proxy_connect_timeout 60s;
   proxy_send_timeout 300s;
   proxy_set_header X-Forwarded-Proto https;
   ```

---

## 6. Desenvolvimento Local

### 6.1. Backend (Python 3.12+)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # No Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Executar suíte de testes unitários e de integração
pytest -v

# Inicializar servidor FastAPI em modo recarregamento
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 6.2. Frontend (React 19 + Vite)

```bash
cd frontend
npm install
npm run typecheck
npm run build
npm run dev
```

Acesse localmente em `http://localhost:5173`. O Vite faz o proxy transparente das requisições `/api/` para `http://127.0.0.1:8000`.

---

## 7. Atalhos de Teclado no Navegador

Na tela de **Explorador SAP** (`/ocorrencias`):
* `1`: Alternar para **Modo Lista Completa**.
* `2`: Alternar para **Modo Lado a Lado (Split-Screen)**.
* `3`: Alternar para **Modo PDF Tela Cheia**.
* `j`: Navegar para a ocorrência **Seguinte**.
* `k`: Navegar para a ocorrência **Anterior**.
* `a`: Alternar flag de triagem **Analisar**.
* `r`: Alternar flag **Ocorrência Relevante**.

---

## 8. Licença e Direitos

Desenvolvido para auditoria técnica industrial e confiabilidade em aciarias. Todos os direitos reservados.
