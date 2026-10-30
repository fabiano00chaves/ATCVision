# Detalhamento Técnico de Vulnerabilidades (Cloudflare Security Audit)

---

### [SEC-CF-01] Cloudflare Access Direct-Origin Header Spoofing (CWE-290)
- **Severidade:** ALTA (CVSS 7.5 / ASVS L3)
- **Componente:** `backend/app/api/deps.py` (linhas 40-63)
- **Vetor de Ataque:**
  O endpoint `/api/v1/*` inspeciona o cabeçalho HTTP `cf-access-authenticated-user-email`. Se a aplicação estiver exposta diretamente sem bloqueio estrito de IP na origem ou se um invasor alcançar a porta do backend diretamente, o envio do cabeçalho com qualquer e-mail (ex: `admin@vision.fk.adm.br`) concede acesso irrestrito sem verificação de senha.
- **Trilha de Código Vulnerável:**
  ```python
  if settings.CLOUDFLARE_AUTH_ENABLED and cf_email and cf_email.strip():
      clean_email = cf_email.strip().lower()
      u_res = await db.execute(select(User).where(User.email == clean_email))
      cf_user = u_res.scalar_one_or_none()
      ...
      return cf_user
  ```
- **Remediação Necessária:**
  Inspecionar o cabeçalho `Cf-Access-Jwt-Assertion` fornecido pelo Cloudflare Zero Trust e/ou validar que a requisição provém de um proxy confiável ou possui chave de integridade compartilhada antes de aceitar o cabeçalho `cf-access-authenticated-user-email`.

---

### [SEC-CF-02] Bypass de Autenticação por Fallback AUTO_LOGIN_ENABLED em Produção (CWE-306)
- **Severidade:** MÉDIA (CVSS 6.5)
- **Componente:** `backend/app/core/config.py` (linha 35) & `backend/app/api/deps.py` (linhas 98-115)
- **Vetor de Ataque:**
  Quando `AUTO_LOGIN_ENABLED = True`, requisições que não apresentem nenhum cookie (`atc_session`), token `Bearer` ou chave de API caem no bloco de auto-login e retornam o primeiro usuário Administrador do banco de dados com `is_admin=True`.
- **Trilha de Código Vulnerável:**
  ```python
  if settings.AUTO_LOGIN_ENABLED:
      admin_res = await db.execute(select(User).where(User.is_admin == True))
      admin_user = admin_res.scalars().first()
      if admin_user:
          return admin_user
  ```
- **Remediação Necessária:**
  Desativar `AUTO_LOGIN_ENABLED` por padrão em produção (`AUTO_LOGIN_ENABLED: bool = False`). Permitir auto-login somente em ambiente de desenvolvimento local explícito (`ENVIRONMENT == "development"`).

---

### [SEC-CF-03] Negação de Serviço por Injeção de Caracteres XML no Gerador ReportLab (CWE-116 / CWE-776)
- **Severidade:** MÉDIA (CVSS 5.3)
- **Componente:** `backend/app/services/report_generator.py` (linha 173)
- **Vetor de Ataque:**
  Títulos e comentários de ocorrências que contenham caracteres reservados de XML (`<`, `>`, `&`, `"`) causam exceção não tratada `xml.parsers.expat.ExpatError` dentro da classe `reportlab.platypus.Paragraph`, impedindo a geração do relatório em PDF para qualquer filtro que inclua esses registros.
- **Trilha de Código Vulnerável:**
  ```python
  else:
      p_text = val.replace("\n", "<br/>")
  row.append(Paragraph(p_text, cell_style))
  ```
- **Remediação Necessária:**
  Sanitizar com `html.escape(val)` antes da substituição de quebras de linha por `<br/>`.

---

### [SEC-CF-04] Injeção de Fórmulas em Planilhas Excel e CSV (CWE-1236)
- **Severidade:** BAIXA (CVSS 3.8)
- **Componente:** `backend/app/services/report_generator.py` (linhas 248-252 e 296)
- **Vetor de Ataque:**
  Valores textuais inseridos em células do Excel (.xlsx) e CSV sem escape de fórmulas permitem que strings iniciadas por `=`, `+`, `-`, `@`, `\t` sejam interpretadas como fórmulas ativas quando abertas por aplicativos de planilhas.
- **Remediação Necessária:**
  Higienizar valores adicionando apóstrofo (`'`) no início quando o primeiro caractere for `=`, `+`, `-`, `@`, `\t`, `\r`.

---

### [SEC-CF-05] Risco de SSRF em URLs de Webhooks (CWE-918)
- **Severidade:** MÉDIA (CVSS 5.8)
- **Componente:** `backend/app/api/v1/endpoints/tokens_webhooks.py` (linha 98) & `backend/app/services/webhook_service.py`
- **Vetor de Ataque:**
  O cadastro de webhooks aceitava qualquer URL de destino sem validação de esquema de rede, permitindo o apontamento para endpoints de metadados internos de nuvem (`http://169.254.169.254/`) ou serviços locais de loopback (`http://localhost:5432`).
- **Remediação Necessária:**
  Implementar validador de URL bloqueando endereços de IP privados, loopback e metadados de nuvem.
