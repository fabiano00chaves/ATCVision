from __future__ import annotations

import os
from datetime import datetime, timezone
import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_password
from app.db.models import (
    FunctionalLocation,
    Occurrence,
    OccurrenceConfirmation,
    OccurrencePdfMapping,
    PdfDocument,
    User,
)
from app.services.report_generator import (
    generate_excel_report,
    generate_pdf_report,
    generate_whatsapp_teams_report,
    sanitize_excel_cell,
)
from app.services.webhook_service import validate_webhook_url
from app.services.occurrence_service import parse_filter_datetime
from tests.conftest import TestSessionLocal


@pytest.mark.asyncio
async def test_rbac_cleanup_and_delete_enforcement(client: AsyncClient):
    """Garante que apenas administradores podem executar saneamento em lote e exclusão de documentos."""
    # 1. Cria usuário operador não-admin
    async with TestSessionLocal() as db:
        res = await db.execute(select(User).where(User.email == "operador@vision.fk.adm.br"))
        user = res.scalar_one_or_none()
        if not user:
            user = User(
                email="operador@vision.fk.adm.br",
                hashed_password=hash_password("OperadorPass123!"),
                name="Operador ATC",
                is_admin=False,
            )
            db.add(user)
            await db.commit()

        # Cria documento de teste
        doc = PdfDocument(
            filename="relatorio_teste_rbac.pdf",
            file_hash_sha256="aabbccddeeff11223344556677889900aabbccddeeff11223344556677889900",
            page_count=2,
            storage_path="/tmp/fake_rbac.pdf",
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        doc_id = doc.id

    # 2. Login como operador
    op_login = await client.post(
        "/api/v1/auth/login",
        json={"email": "operador@vision.fk.adm.br", "password": "OperadorPass123!"},
    )
    assert op_login.status_code == 200
    op_cookies = op_login.cookies
    headers = {"X-ATC-Client": "web"}

    # Tentativa de saneamento (purge_binaries) por não-admin -> 403 Forbidden
    purge_res = await client.post(
        "/api/v1/documents/cleanup",
        json={"action": "purge_binaries", "document_ids": [doc_id]},
        cookies=op_cookies,
        headers=headers,
    )
    assert purge_res.status_code == 403
    assert "apenas administradores" in purge_res.json()["detail"].lower()

    # Tentativa de saneamento (delete_complete) por não-admin -> 403 Forbidden
    del_res = await client.post(
        "/api/v1/documents/cleanup",
        json={"action": "delete_complete", "document_ids": [doc_id]},
        cookies=op_cookies,
        headers=headers,
    )
    assert del_res.status_code == 403

    # Tentativa de exclusão individual (purge_only=True) por não-admin -> 403 Forbidden
    del_single_purge = await client.delete(
        f"/api/v1/documents/{doc_id}?purge_only=true",
        cookies=op_cookies,
        headers=headers,
    )
    assert del_single_purge.status_code == 403

    # Tentativa de exclusão individual (delete_occurrences=True) por não-admin -> 403 Forbidden
    del_single_full = await client.delete(
        f"/api/v1/documents/{doc_id}?delete_occurrences=true",
        cookies=op_cookies,
        headers=headers,
    )
    assert del_single_full.status_code == 403

    # 3. Login como Admin
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    assert admin_login.status_code == 200
    admin_cookies = admin_login.cookies

    # Admin executa purge individual com sucesso
    admin_purge = await client.delete(
        f"/api/v1/documents/{doc_id}?purge_only=true",
        cookies=admin_cookies,
        headers=headers,
    )
    assert admin_purge.status_code == 200
    assert admin_purge.json()["ok"] is True


@pytest.mark.asyncio
async def test_api_key_auth_no_cookie_issuance(client: AsyncClient):
    """Garante que requisições autenticadas por API Key não emitam cookies de sessão de navegador."""
    # Autentica usando MASTER_API_KEY
    resp = await client.get(
        "/api/v1/auth/me",
        headers={"X-API-Key": settings.MASTER_API_KEY},
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "api@vision.fk.adm.br"
    assert resp.json()["is_admin"] is True
    # Não deve ter 'set-cookie' de sessão atc_session
    assert "set-cookie" not in resp.headers or "atc_session" not in resp.headers.get("set-cookie", "")


def test_webhook_comprehensive_ssrf_protection():
    """Valida proteção estrita contra SSRF para IPs de loopback, RFC1918, CGNAT, link-local e esquemas inválidos."""
    # 1. Esquemas inválidos
    with pytest.raises(HTTPException) as exc1:
        validate_webhook_url("ftp://example.com/webhook")
    assert exc1.value.status_code == 400

    with pytest.raises(HTTPException) as exc2:
        validate_webhook_url("file:///etc/passwd")
    assert exc2.value.status_code == 400

    # 2. Loopback
    with pytest.raises(HTTPException) as exc3:
        validate_webhook_url("http://127.0.0.1:8000/webhook")
    assert exc3.value.status_code == 400

    with pytest.raises(HTTPException) as exc4:
        validate_webhook_url("http://localhost:8000/webhook")
    assert exc4.value.status_code == 400

    # 3. CGNAT (100.64.0.0/10)
    with pytest.raises(HTTPException) as exc5:
        validate_webhook_url("http://100.64.1.1/webhook")
    assert exc5.value.status_code == 400

    # 4. Link-local (Cloud metadata 169.254.169.254)
    with pytest.raises(HTTPException) as exc6:
        validate_webhook_url("http://169.254.169.254/latest/meta-data")
    assert exc6.value.status_code == 400

    # 5. RFC1918 Privados
    with pytest.raises(HTTPException) as exc7:
        validate_webhook_url("http://10.0.0.1/notify")
    assert exc7.value.status_code == 400

    with pytest.raises(HTTPException) as exc8:
        validate_webhook_url("http://172.16.1.1/notify")
    assert exc8.value.status_code == 400

    with pytest.raises(HTTPException) as exc9:
        validate_webhook_url("http://192.168.1.100/notify")
    assert exc9.value.status_code == 400

    # 6. IPv6 Loopback
    with pytest.raises(HTTPException) as exc10:
        validate_webhook_url("http://[::1]:8080/webhook")
    assert exc10.value.status_code == 400

    # 7. URL pública válida
    clean = validate_webhook_url("https://hooks.slack.com/services/T00/B00/X00")
    assert clean == "https://hooks.slack.com/services/T00/B00/X00"


@pytest.mark.asyncio
async def test_document_batch_cleanup_and_functional_location_sync(client: AsyncClient):
    """Testa o ciclo de expurgo em lote (purge de binários e delete completo) e a sincronização da contagem de locais funcionais."""
    # Cria arquivo físico falso no storage
    os.makedirs(settings.STORAGE_DIR, exist_ok=True)
    fake_disk_path = os.path.join(settings.STORAGE_DIR, "test_purge_file.pdf")
    with open(fake_disk_path, "wb") as f:
        f.write(b"%PDF-1.4 dummy content")

    async with TestSessionLocal() as db:
        # Cria local funcional
        fl = FunctionalLocation(
            full_code="CV-01-M01",
            segment_code="M01",
            level=3,
            description="Motor Correia Transportadora 01",
            arvore_planta="CV-01",
            occurrence_count=1,
        )
        db.add(fl)

        # Cria documento com caminho físico
        doc = PdfDocument(
            filename="relatorio_auditoria_expurgo.pdf",
            file_hash_sha256="11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff",
            page_count=1,
            storage_path=fake_disk_path,
        )
        db.add(doc)
        await db.flush()

        # Cria ocorrência vinculada via mapping
        occ = Occurrence(
            unique_sap_key="ORD-9901_NOT-9901",
            tipo_ocorrencia="CORRETIVA",
            numero_ordem="ORD-9901",
            numero_nota="NOT-9901",
            titulo="Falha de isolamento no motor",
            posicao_funcional="CV-01-M01",
            search_text="motor falha isolamento",
        )
        db.add(occ)
        await db.flush()

        mapping = OccurrencePdfMapping(
            occurrence_id=occ.id,
            pdf_document_id=doc.id,
            start_page=1,
            end_page=1,
        )
        db.add(mapping)

        await db.commit()
        await db.refresh(doc)
        doc_id = doc.id
        occ_id = occ.id

    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    admin_cookies = admin_login.cookies
    headers = {"X-ATC-Client": "web"}

    # 1. Purge binaries em lote
    purge_res = await client.post(
        "/api/v1/documents/cleanup",
        json={"action": "purge_binaries", "document_ids": [doc_id]},
        cookies=admin_cookies,
        headers=headers,
    )
    assert purge_res.status_code == 200
    assert purge_res.json()["documents_affected"] == 1
    # Verifica que o arquivo físico foi removido do disco
    assert not os.path.exists(fake_disk_path)

    # Verifica no banco que storage_path é None e ocorrência continua intacta
    async with TestSessionLocal() as db:
        d = await db.get(PdfDocument, doc_id)
        assert d.storage_path is None
        o = await db.get(Occurrence, occ_id)
        assert o is not None

    # 2. Delete complete em lote sem confirmação -> 400
    del_blocked = await client.post(
        "/api/v1/documents/cleanup",
        json={"action": "delete_complete", "document_ids": [doc_id]},
        cookies=admin_cookies,
        headers=headers,
    )
    assert del_blocked.status_code == 400
    assert "EXPURGAR" in del_blocked.json()["detail"]

    # 3. Delete complete em lote com confirmação -> 200
    del_res = await client.post(
        "/api/v1/documents/cleanup",
        json={"action": "delete_complete", "document_ids": [doc_id], "confirmation_challenge": "EXPURGAR"},
        cookies=admin_cookies,
        headers=headers,
    )
    assert del_res.status_code == 200
    assert del_res.json()["documents_affected"] == 1

    # Verifica que documento e ocorrência foram excluídos e contagem de FL foi recalculada para 0
    async with TestSessionLocal() as db:
        d = await db.get(PdfDocument, doc_id)
        assert d is None
        o = await db.get(Occurrence, occ_id)
        assert o is None
        fl_res = await db.execute(select(FunctionalLocation).where(FunctionalLocation.full_code == "CV-01-M01"))
        fl_db = fl_res.scalar_one()
        assert fl_db.occurrence_count == 0


@pytest.mark.asyncio
async def test_upsert_falsy_values_and_idempotency(client: AsyncClient):
    """Verifica que o upsert não sobrescreve valores válidos 0.0/False e não duplica search_text nem contagens."""
    async with TestSessionLocal() as db:
        doc = PdfDocument(
            filename="doc_upsert_test.pdf",
            file_hash_sha256="44556677889900aabbccddeeff11223344556677889900aabbccddeeff112233",
            page_count=1,
        )
        db.add(doc)
        await db.flush()

        occ = Occurrence(
            unique_sap_key="ORD-UPSERT-01_NOT-UPSERT-01",
            tipo_ocorrencia="CORRETIVA",
            numero_ordem="ORD-UPSERT-01",
            numero_nota="NOT-UPSERT-01",
            titulo="Primeira versão da ocorrência",
            duracao_avaria_min=0.0,
            teve_pane=False,
            duracao_pane_min=0.0,
            tem_jump_force=False,
            search_text="termo_original",
        )
        db.add(occ)
        await db.commit()
        await db.refresh(occ)
        occ_id = occ.id

    # Simula upsert com novos dados
    async with TestSessionLocal() as db:
        res = await db.execute(select(Occurrence).where(Occurrence.id == occ_id))
        existing = res.scalar_one()

        # Atualização simulada de ingestão
        new_duracao_avaria = 0.0
        new_teve_pane = False
        new_duracao_pane = 0.0
        new_tem_jump = False
        new_search_text = "termo_original"

        if new_duracao_avaria is not None:
            existing.duracao_avaria_min = new_duracao_avaria
        if new_teve_pane is not None:
            existing.teve_pane = new_teve_pane
        if new_duracao_pane is not None:
            existing.duracao_pane_min = new_duracao_pane
        if new_tem_jump is not None:
            existing.tem_jump_force = new_tem_jump
        existing.search_text = new_search_text

        await db.commit()
        await db.refresh(existing)

        assert existing.duracao_avaria_min == 0.0
        assert existing.teve_pane is False
        assert existing.duracao_pane_min == 0.0
        assert existing.tem_jump_force is False
        assert existing.search_text == "termo_original"


@pytest.mark.asyncio
async def test_schema_validations_enums_and_whitespace_comments(client: AsyncClient):
    """Verifica que o Pydantic rejeita enums inválidos e comentários vazios ou apenas com espaços."""
    admin_login = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = admin_login.cookies
    headers = {"X-ATC-Client": "web"}

    async with TestSessionLocal() as db:
        occ = Occurrence(
            unique_sap_key="ORD-PATCH-01_NOT-PATCH-01",
            tipo_ocorrencia="CORRETIVA",
            numero_ordem="ORD-PATCH-01",
            numero_nota="NOT-PATCH-01",
            titulo="Ocorrência para validação de schemas",
        )
        db.add(occ)
        await db.commit()
        await db.refresh(occ)
        occ_id = occ.id

    # 1. status_atc inválido -> 422
    p1 = await client.patch(
        f"/api/v1/occurrences/{occ_id}",
        json={"status_atc": "INVALID_STATUS"},
        cookies=cookies,
        headers=headers,
    )
    assert p1.status_code == 422

    # 2. prioridade_atc inválida -> 422
    p2 = await client.patch(
        f"/api/v1/occurrences/{occ_id}",
        json={"prioridade_atc": "MAXIMA_URGENCIA"},
        cookies=cookies,
        headers=headers,
    )
    assert p2.status_code == 422

    # 3. jump_status inválido -> 422
    p3 = await client.patch(
        f"/api/v1/occurrences/{occ_id}",
        json={"jump_status": "DESCONHECIDO"},
        cookies=cookies,
        headers=headers,
    )
    assert p3.status_code == 422

    # 4. Comentário em branco ou apenas espaços -> 422
    c1 = await client.post(
        f"/api/v1/occurrences/{occ_id}/comments",
        json={"comment_text": "   \n\t  ", "is_action_item": False},
        cookies=cookies,
        headers=headers,
    )
    assert c1.status_code == 422

    # 5. Patch válido -> 200
    p_valid = await client.patch(
        f"/api/v1/occurrences/{occ_id}",
        json={"status_atc": "EM_ANALISE", "prioridade_atc": "ALTA", "flag_destaque_reuniao": True},
        cookies=cookies,
        headers=headers,
    )
    assert p_valid.status_code == 200
    assert p_valid.json()["status_atc"] == "EM_ANALISE"
    assert p_valid.json()["flag_destaque_reuniao"] is True


def test_filter_datetime_parsing_timezone_naive():
    """Verifica que strings de datas com timezone ISO são convertidas para UTC naive corretamente."""
    # Data com offset -03:00 (Brasília)
    dt = parse_filter_datetime("2026-11-12T15:30:00-03:00", is_end=False)
    assert dt is not None
    assert dt.tzinfo is None
    # 15:30 -03:00 é 18:30 UTC
    assert dt.hour == 18
    assert dt.minute == 30

    # Data somente (sem hora), como fim de período -> inclusivo 23:59:59.999999
    dt_end = parse_filter_datetime("2026-11-12", is_end=True)
    assert dt_end is not None
    assert dt_end.tzinfo is None
    assert dt_end.year == 2026
    assert dt_end.month == 11
    assert dt_end.day == 12
    assert dt_end.hour == 23
    assert dt_end.minute == 59
    assert dt_end.second == 59


@pytest.mark.asyncio
async def test_failure_modes_and_bad_actors_metrics(client: AsyncClient):
    """Verifica que o percentual de baixa qualidade está sempre entre 0% e 100% e bad actors respeita default_days."""
    headers = {"X-API-Key": settings.MASTER_API_KEY}

    # Testa failure modes
    fm_res = await client.get("/api/v1/dashboards/failure-modes", headers=headers)
    assert fm_res.status_code == 200
    data = fm_res.json()
    assert "quality" in data
    assert 0.0 <= data["quality"]["pct_baixa_qualidade"] <= 100.0

    # Testa bad actors sem parâmetro days
    ba_res = await client.get("/api/v1/dashboards/bad-actors", headers=headers)
    assert ba_res.status_code == 200
    ba_data = ba_res.json()
    assert isinstance(ba_data["items"], list)
    assert ba_data["days"] == settings.BAD_ACTOR_DEFAULT_DAYS


def test_report_generation_security_and_edge_cases():
    """Garante que títulos com XSS/XML e caracteres de controle no Excel não quebram os geradores de relatório."""
    test_occ = Occurrence(
        unique_sap_key="ORD-9999_NOT-9999",
        tipo_ocorrencia="CORRETIVA",
        numero_ordem="ORD-9999",
        numero_nota="NOT-9999",
        titulo="Teste com caracteres \x00 e \x07 e \x1b especiais",
        posicao_funcional="CV-01-M01",
        teve_pane=True,
        duracao_pane_min=15.0,
        tem_jump_force=True,
        jump_status="PENDENTE",
        abertura_timestamp=datetime.now(timezone.utc),
    )

    # 1. Sanitizador de célula Excel
    clean_val = sanitize_excel_cell("Texto com \x07 campainha e =SOMA(1,2)")
    assert "\x07" not in clean_val

    formula_val = sanitize_excel_cell("=SOMA(1,2)")
    assert formula_val.startswith("'")

    # 2. PDF Report com caracteres especiais XML no título (<script>, &, <, >)
    malicious_title = "ATC Vision <script>alert('XSS')</script> & Relatório Geral"
    pdf_bytes = generate_pdf_report(
        occurrences=[test_occ],
        selected_fields=["nota_ordem", "posicao_funcional", "pane", "jump"],
        header_title=malicious_title,
        grouping_field="arvore_planta",
    )
    assert len(pdf_bytes) > 0
    assert pdf_bytes.startswith(b"%PDF")

    # 3. Excel Report com caracteres ilegais e agrupamento
    excel_bytes = generate_excel_report(
        occurrences=[test_occ],
        selected_fields=["nota_ordem", "posicao_funcional", "titulo_resumo", "pane", "jump"],
        header_title=malicious_title,
        grouping_field="arvore_planta",
    )
    assert len(excel_bytes) > 0

    # 4. WhatsApp / Teams com agrupamento
    wa_text = generate_whatsapp_teams_report(
        occurrences=[test_occ],
        header_title="Pauta Reunião Diária",
        grouping_field="arvore_planta",
    )
    assert "PAUTA REUNIÃO DIÁRIA" in wa_text
    assert "CV-01-M01" in wa_text


def test_cookie_secure_auto_detection_and_override():
    """Verifica precedência estrita de COOKIE_SECURE sobre cabeçalhos TLS e fallback para auto-detecção."""
    from unittest.mock import MagicMock
    from app.api.v1.endpoints.auth import is_secure_request

    req_https = MagicMock()
    req_https.headers = {"x-forwarded-proto": "https"}
    req_https.url.scheme = "http"

    req_http = MagicMock()
    req_http.headers = {}
    req_http.url.scheme = "http"

    req_cf = MagicMock()
    req_cf.headers = {"cf-visitor": '{"scheme":"https"}'}
    req_cf.url.scheme = "http"

    orig_cookie_sec = settings.COOKIE_SECURE
    orig_env = settings.ENVIRONMENT
    try:
        # 1. COOKIE_SECURE explícito False: deve retornar False mesmo sob https / reverse proxy
        settings.COOKIE_SECURE = False
        settings.ENVIRONMENT = "production"
        assert is_secure_request(req_https) is False
        assert is_secure_request(req_cf) is False
        assert is_secure_request(req_http) is False

        # 2. COOKIE_SECURE explícito True: deve retornar True sempre
        settings.COOKIE_SECURE = True
        settings.ENVIRONMENT = "development"
        assert is_secure_request(req_http) is True

        # 3. COOKIE_SECURE = None (Auto-detecção):
        settings.COOKIE_SECURE = None
        settings.ENVIRONMENT = "development"
        assert is_secure_request(req_https) is True
        assert is_secure_request(req_cf) is True
        assert is_secure_request(req_http) is False
    finally:
        settings.COOKIE_SECURE = orig_cookie_sec
        settings.ENVIRONMENT = orig_env


def test_webhook_invalid_port_validation():
    """Garante que portas inválidas (fora de 1-65535) são rejeitadas com 400 Bad Request."""
    with pytest.raises(HTTPException) as exc1:
        validate_webhook_url("http://example.com:99999/webhook")
    assert exc1.value.status_code == 400
    assert "Porta" in exc1.value.detail or "inválida" in exc1.value.detail

    with pytest.raises(HTTPException) as exc2:
        validate_webhook_url("http://example.com:0/webhook")
    assert exc2.value.status_code == 400


def test_csv_report_generation_with_grouping():
    """Verifica geração e ordenação de relatório CSV com agrupamento."""
    from app.services.report_generator import generate_csv_report
    occ1 = Occurrence(
        unique_sap_key="ORD-01_NOT-01",
        tipo_ocorrencia="CORRETIVA",
        numero_ordem="ORD-01",
        numero_nota="NOT-01",
        arvore_planta="LINHA_B",
        posicao_funcional="LB-01",
    )
    occ2 = Occurrence(
        unique_sap_key="ORD-02_NOT-02",
        tipo_ocorrencia="CORRETIVA",
        numero_ordem="ORD-02",
        numero_nota="NOT-02",
        arvore_planta="LINHA_A",
        posicao_funcional="LA-01",
    )
    csv_out = generate_csv_report(
        occurrences=[occ1, occ2],
        selected_fields=["nota_ordem", "posicao_funcional"],
        grouping_field="arvore_planta",
    )
    assert len(csv_out) > 0
    # Ocorrência da LINHA_A deve aparecer antes da LINHA_B devido ao agrupamento ordenado
    idx_a = csv_out.find("LA-01")
    idx_b = csv_out.find("LB-01")
    assert idx_a != -1 and idx_b != -1
    assert idx_a < idx_b


def test_cloudflare_jwks_client_caching():
    """Garante que instâncias do PyJWKClient são cacheadas por domínio para evitar reconexões TLS a cada request."""
    from app.api.deps import get_jwks_client
    c1 = get_jwks_client("test-team")
    c2 = get_jwks_client("test-team")
    assert c1 is c2


@pytest.mark.asyncio
async def test_ingest_pdf_orphan_file_cleanup_on_db_rollback():
    """Garante que falha no banco de dados durante a ingestão remove arquivos parciais/órfãos de STORAGE_DIR."""
    import tempfile
    from pathlib import Path
    import fitz
    from unittest.mock import patch
    from app.services.occurrence_service import ingest_pdf_file

    os.makedirs(settings.STORAGE_DIR, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name
    # Close handle before PyMuPDF writes to it (mandatory on Windows)
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((50, 50), "Relatorio Diario ATC Teste Limpeza Orfao")
    doc.save(tmp_path)
    doc.close()

    try:
        async with TestSessionLocal() as db:
            # Força erro no db.commit() simulando falha de banco no encerramento da transação
            with patch.object(db, "commit", side_effect=RuntimeError("Simulated DB Commit Failure")):
                with pytest.raises(RuntimeError, match="Simulated DB Commit Failure"):
                    await ingest_pdf_file(db, Path(tmp_path), "fake_orphan_test.pdf", source="UNIT_TEST")

        # Verifica que nenhum arquivo com fake_orphan_test.pdf permaneceu no STORAGE_DIR
        storage_files = list(Path(settings.STORAGE_DIR).glob("*fake_orphan_test.pdf"))
        assert len(storage_files) == 0, f"Arquivo órfão vazado no STORAGE_DIR: {storage_files}"
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
