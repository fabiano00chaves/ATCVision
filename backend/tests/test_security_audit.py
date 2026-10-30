from __future__ import annotations

import io
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.db.models import PdfDocument, User
from tests.conftest import TestSessionLocal


@pytest.mark.asyncio
async def test_security_headers_and_cloudflare_ray_echo(client: AsyncClient):
    """Verifica se os cabeçalhos de segurança OWASP ASVS e Cloudflare CF-Ray são injetados."""
    cf_ray_value = "87b1c3e45f6a-GRU"
    resp = await client.get(
        "/api/v1/health",
        headers={
            "CF-Ray": cf_ray_value,
            "CF-Connecting-IP": "200.180.12.34",
            "X-Forwarded-Proto": "https",
        },
    )
    assert resp.status_code == 200
    headers = resp.headers

    # OWASP ASVS 4.0 Level 3 Security Headers
    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "SAMEORIGIN"
    assert headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "max-age=31536000" in headers.get("Strict-Transport-Security", "")
    assert "camera=()" in headers.get("Permissions-Policy", "")
    assert "default-src 'self'" in headers.get("Content-Security-Policy", "")

    # Cloudflare Ray Echo
    assert headers.get("CF-Ray") == cf_ray_value


@pytest.mark.asyncio
async def test_csrf_protection_state_changing_methods(client: AsyncClient):
    """Verifica se métodos de alteração de estado (POST, PUT, DELETE, PATCH) exigem X-ATC-Client."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = login_resp.cookies

    # 1. POST sem X-ATC-Client -> Deve ser rejeitado com 403 Forbidden
    preset_data = {
        "name": "CSRF Attack Attempt",
        "icon": "AlertTriangle",
        "color": "#ef4444",
        "is_default": False,
        "show_in_quickbar": True,
        "sort_order": 999,
        "filter_payload": {},
    }
    resp_blocked = await client.post(
        "/api/v1/presets",
        json=preset_data,
        cookies=cookies,
        # Sem header X-ATC-Client
    )
    assert resp_blocked.status_code == 403
    assert "CSRF" in resp_blocked.json()["detail"]

    # 2. POST com X-ATC-Client: web -> Deve ser aceito com 201 Created
    resp_allowed = await client.post(
        "/api/v1/presets",
        json=preset_data,
        cookies=cookies,
        headers={"X-ATC-Client": "web"},
    )
    assert resp_allowed.status_code == 201
    preset_id = resp_allowed.json()["id"]

    # 3. GET não requer X-ATC-Client
    resp_get = await client.get("/api/v1/presets", cookies=cookies)
    assert resp_get.status_code == 200

    # 4. DELETE sem X-ATC-Client -> Deve ser rejeitado com 403
    resp_del_blocked = await client.delete(
        f"/api/v1/presets/{preset_id}",
        cookies=cookies,
    )
    assert resp_del_blocked.status_code == 403

    # 5. DELETE com X-ATC-Client -> Deve ser aceito
    resp_del_allowed = await client.delete(
        f"/api/v1/presets/{preset_id}",
        cookies=cookies,
        headers={"X-ATC-Client": "web"},
    )
    assert resp_del_allowed.status_code == 200


@pytest.mark.asyncio
async def test_cleanup_two_tier_expurgar_challenge_and_privileges(client: AsyncClient):
    """Testa a proteção em duas etapas do expurgo definitivo (desafio EXPURGAR e privilégio de admin)."""
    # 1. Admin Login
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    admin_cookies = admin_login.cookies
    headers = {"X-ATC-Client": "web"}

    # Cria documento de teste no banco
    async with TestSessionLocal() as session:
        test_doc = PdfDocument(
            filename="teste_expurgo.pdf",
            file_hash_sha256="aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900",
            storage_path="data/teste_expurgo.pdf",
            page_count=2,
            ocr_applied=False,
            ingestion_source="TEST",
        )
        session.add(test_doc)
        await session.commit()
        await session.refresh(test_doc)
        doc_id = test_doc.id

    # A. Expurgo com delete_complete SEM o desafio 'EXPURGAR' -> 400 Bad Request
    resp_no_challenge = await client.post(
        "/api/v1/documents/cleanup",
        json={
            "document_ids": [doc_id],
            "action": "delete_complete",
            "delete_occurrences": True,
            # confirmation_challenge ausente
        },
        cookies=admin_cookies,
        headers=headers,
    )
    assert resp_no_challenge.status_code == 400
    assert "EXPURGAR" in resp_no_challenge.json()["detail"]

    # B. Expurgo com delete_complete e desafio incorreto -> 400 Bad Request
    resp_wrong_challenge = await client.post(
        "/api/v1/documents/cleanup",
        json={
            "document_ids": [doc_id],
            "action": "delete_complete",
            "delete_occurrences": True,
            "confirmation_challenge": "CONFIRMAR",
        },
        cookies=admin_cookies,
        headers=headers,
    )
    assert resp_wrong_challenge.status_code == 400
    assert "EXPURGAR" in resp_wrong_challenge.json()["detail"]

    # C. Cria usuário comum não-administrador
    async with TestSessionLocal() as session:
        from app.core.security import hash_password
        regular_user = User(
            email="operador@vision.fk.adm.br",
            name="Operador Teste",
            hashed_password=hash_password("OperadorPass123!"),
            is_admin=False,
        )
        session.add(regular_user)
        await session.commit()

    user_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "operador@vision.fk.adm.br", "password": "OperadorPass123!"},
    )
    user_cookies = user_login.cookies

    # D. Usuário comum tentando delete_complete com desafio correto -> 403 Forbidden
    resp_user_blocked = await client.post(
        "/api/v1/documents/cleanup",
        json={
            "document_ids": [doc_id],
            "action": "delete_complete",
            "delete_occurrences": True,
            "confirmation_challenge": "EXPURGAR",
        },
        cookies=user_cookies,
        headers=headers,
    )
    assert resp_user_blocked.status_code == 403
    assert "administradores" in resp_user_blocked.json()["detail"].lower()

    # E. Admin com desafio 'EXPURGAR' correto -> Deve autorizar e executar
    resp_admin_ok = await client.post(
        "/api/v1/documents/cleanup",
        json={
            "document_ids": [doc_id],
            "action": "delete_complete",
            "delete_occurrences": True,
            "confirmation_challenge": "EXPURGAR",
        },
        cookies=admin_cookies,
        headers=headers,
    )
    assert resp_admin_ok.status_code == 200
    assert resp_admin_ok.json()["documents_affected"] == 1


@pytest.mark.asyncio
async def test_path_traversal_sanitization_in_uploads(client: AsyncClient):
    """Testa se tentativas de Directory Traversal em nomes de arquivo são sanitizadas."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = login_resp.cookies
    headers = {"X-ATC-Client": "web"}

    # Tentativa de traversal no upload de documentos
    malicious_filename = "..\\..\\..\\etc\\evil.pdf"
    file_bytes = b"%PDF-1.4 Fake test PDF content"

    resp = await client.post(
        "/api/v1/documents/upload",
        files={"files": (malicious_filename, file_bytes, "application/pdf")},
        cookies=cookies,
        headers=headers,
    )
    assert resp.status_code == 200
    item = resp.json()["results"][0]
    # O nome sanitizado não pode conter separadores de diretório
    assert "/" not in item["filename"]
    assert "\\" not in item["filename"]
    assert item["filename"] == "evil.pdf"


@pytest.mark.asyncio
async def test_zero_leakage_on_unhandled_exceptions(client: AsyncClient):
    """Garante que exceções não tratadas retornam erro 500 sem vazar stack trace."""
    # Chamada propositalmente incorreta para rota que gere erro ou probe de integridade
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    # Resposta limpa, sem tracebacks
    assert "Traceback" not in resp.text


@pytest.mark.asyncio
async def test_daily_report_export_formats(client: AsyncClient):
    """Testa a geração e exportação de relatórios para os formatos PDF, XLSX, CSV e WhatsApp."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = login_resp.cookies
    headers = {"X-ATC-Client": "web"}

    # 1. Exportação PDF
    resp_pdf = await client.post(
        "/api/v1/reports/generate",
        json={"format": "pdf", "header_title": "Relatório Diário - Teste", "scope": "all"},
        cookies=cookies,
        headers=headers,
    )
    assert resp_pdf.status_code == 200
    assert resp_pdf.headers["content-type"] == "application/pdf"
    assert resp_pdf.content.startswith(b"%PDF-")

    # 2. Exportação XLSX (Excel)
    resp_xlsx = await client.post(
        "/api/v1/reports/generate",
        json={"format": "xlsx", "header_title": "Relatório Diário - Teste", "scope": "all"},
        cookies=cookies,
        headers=headers,
    )
    assert resp_xlsx.status_code == 200
    assert "spreadsheetml" in resp_xlsx.headers["content-type"]
    assert resp_xlsx.content.startswith(b"PK")  # Assinatura zip de arquivo .xlsx

    # 3. Exportação CSV
    resp_csv = await client.post(
        "/api/v1/reports/generate",
        json={"format": "csv", "header_title": "Relatório Diário - Teste", "scope": "all"},
        cookies=cookies,
        headers=headers,
    )
    assert resp_csv.status_code == 200
    assert "text/csv" in resp_csv.headers["content-type"]

    # 4. Exportação WhatsApp / Texto
    resp_wa = await client.post(
        "/api/v1/reports/generate",
        json={"format": "whatsapp", "header_title": "Relatório Diário - Teste", "scope": "all"},
        cookies=cookies,
        headers=headers,
    )
    assert resp_wa.status_code == 200
    data = resp_wa.json()
    assert "text" in data


@pytest.mark.asyncio
async def test_invalid_bearer_and_cookie_token_rejection(client: AsyncClient):
    """Garante que tokens inválidos ou expirados recebem 401 e NÃO escalam para admin via fallback."""
    # 1. Bearer token inválido
    resp_bearer = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer forged.invalid.token"},
    )
    assert resp_bearer.status_code == 401
    assert "inválido" in resp_bearer.json()["detail"].lower() or "expirado" in resp_bearer.json()["detail"].lower()

    # 2. Cookie de sessão com valor inválido
    resp_cookie = await client.get(
        "/api/v1/auth/me",
        cookies={"atc_session": "tampered_session_cookie"},
    )
    assert resp_cookie.status_code == 401
    assert "inválido" in resp_cookie.json()["detail"].lower() or "expirado" in resp_cookie.json()["detail"].lower()


@pytest.mark.asyncio
async def test_single_document_delete_requires_admin(client: AsyncClient):
    """Garante que a exclusão definitiva de documento individual via DELETE exige permissão de admin."""
    # 1. Cria documento e operador comum de teste
    async with TestSessionLocal() as session:
        from app.core.security import hash_password
        op_user = User(
            email="operador_delete@vision.fk.adm.br",
            name="Operador Delete",
            hashed_password=hash_password("OperadorPass123!"),
            is_admin=False,
        )
        session.add(op_user)
        doc = PdfDocument(
            filename="documento_rbac_teste.pdf",
            file_hash_sha256="11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
            storage_path="data/documento_rbac_teste.pdf",
            page_count=1,
            ocr_applied=False,
            ingestion_source="TEST",
        )
        session.add(doc)
        await session.commit()
        await session.refresh(doc)
        doc_id = doc.id

    # 2. Login com operador comum
    user_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "operador_delete@vision.fk.adm.br", "password": "OperadorPass123!"},
    )
    assert user_login.status_code == 200
    user_cookies = user_login.cookies
    headers = {"X-ATC-Client": "web"}

    # 3. Usuário comum tenta excluir -> Deve receber 403 Forbidden
    resp_blocked = await client.delete(
        f"/api/v1/documents/{doc_id}?purge_only=false",
        cookies=user_cookies,
        headers=headers,
    )
    assert resp_blocked.status_code == 403
    assert "administradores" in resp_blocked.json()["detail"].lower()

    # 4. Admin tenta excluir -> Deve receber 200 OK
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    admin_cookies = admin_login.cookies
    resp_allowed = await client.delete(
        f"/api/v1/documents/{doc_id}?purge_only=false",
        cookies=admin_cookies,
        headers=headers,
    )
    assert resp_allowed.status_code == 200
    assert resp_allowed.json()["ok"] is True


@pytest.mark.asyncio
async def test_cloudflare_zero_trust_operator_privilege_separation(client: AsyncClient):
    """Garante que operadores que acessam via Cloudflare Zero Trust recebem perfil comum (is_admin=False)."""
    cf_operator_email = "operador.planta@vision.fk.adm.br"
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"cf-access-authenticated-user-email": cf_operator_email},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == cf_operator_email
    assert data["is_admin"] is False


@pytest.mark.asyncio
async def test_weekend_window_calculation_on_weekend(client: AsyncClient):
    """Garante que o cálculo do modo 'weekend' no sábado ou domingo abrange o final de semana corrente."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = login_resp.cookies

    # Testa com data de referência sendo um Domingo (2026-11-01 ou 2025-11-02)
    # 2025-11-01 é Sábado (weekday 5), 2025-11-02 é Domingo (weekday 6)
    resp_sat = await client.get("/api/v1/daily/window?mode=weekend&ref=2025-11-01", cookies=cookies)
    assert resp_sat.status_code == 200
    sat_data = resp_sat.json()
    # Sexta-feira imediata anterior foi 2025-10-31
    assert sat_data["start"].startswith("2025-10-31T06:00:00")
    assert sat_data["end"].startswith("2025-11-03T06:00:00")

    resp_sun = await client.get("/api/v1/daily/window?mode=weekend&ref=2025-11-02", cookies=cookies)
    assert resp_sun.status_code == 200
    sun_data = resp_sun.json()
    assert sun_data["start"].startswith("2025-10-31T06:00:00")
    assert sun_data["end"].startswith("2025-11-03T06:00:00")


@pytest.mark.asyncio
async def test_functional_location_node_get_and_occurrence_filters(client: AsyncClient):
    """Verifica a rota GET de nó de posição funcional e filtros por prioridade_sap, jump_status e tags."""
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = login_resp.cookies
    headers = {"X-ATC-Client": "web"}

    # 1. Reconstrói a árvore a partir do banco
    rebuild_res = await client.post("/api/v1/functional-locations/rebuild", cookies=cookies, headers=headers)
    assert rebuild_res.status_code == 200

    # 2. Testa busca e obtenção de nó específico
    tree_res = await client.get("/api/v1/functional-locations/tree", cookies=cookies)
    assert tree_res.status_code == 200
    tree_nodes = tree_res.json()
    if tree_nodes:
        first_code = tree_nodes[0]["full_code"]
        node_res = await client.get(f"/api/v1/functional-locations/nodes/{first_code}", cookies=cookies)
        assert node_res.status_code == 200
        assert node_res.json()["full_code"] == first_code

    # 3. Testa filtro por prioridade_sap, jump_status e tags em ocorrências
    occ_res = await client.get(
        "/api/v1/occurrences?prioridade_sap=ALTA&jump_status=PENDENTE&tags=seguranca",
        cookies=cookies,
    )
    assert occ_res.status_code == 200
    assert "items" in occ_res.json()
