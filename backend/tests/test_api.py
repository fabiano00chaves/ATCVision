from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.core.config import settings


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["db"] is True


@pytest.mark.asyncio
async def test_auth_login_and_me(client: AsyncClient):
    # Try invalid login
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "wrong@vision.fk.adm.br", "password": "wrong"},
    )
    assert resp.status_code == 401

    # Valid admin login
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    assert resp.status_code == 200
    assert "atc_session" in resp.cookies
    data = resp.json()
    assert data["user"]["email"] == settings.ADMIN_EMAIL
    assert data["user"]["is_admin"] is True

    # Call /auth/me with cookie
    resp = await client.get("/api/v1/auth/me", cookies=resp.cookies)
    assert resp.status_code == 200
    assert resp.json()["email"] == settings.ADMIN_EMAIL


@pytest.mark.asyncio
async def test_daily_window(client: AsyncClient):
    # Log in
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = login_resp.cookies

    # Test last24
    resp = await client.get("/api/v1/daily/window?mode=last24", cookies=cookies)
    assert resp.status_code == 200
    data = resp.json()
    assert "start" in data
    assert "end" in data
    assert "Último Turno" in data["label"]

    # Test weekend
    resp = await client.get("/api/v1/daily/window?mode=weekend", cookies=cookies)
    assert resp.status_code == 200
    assert "Pós-Final de Semana" in resp.json()["label"]


@pytest.mark.asyncio
async def test_presets_crud(client: AsyncClient):
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = login_resp.cookies
    headers = {"X-ATC-Client": "web"}

    # List seeded presets
    resp = await client.get("/api/v1/presets", cookies=cookies)
    assert resp.status_code == 200
    presets = resp.json()
    assert len(presets) >= 6

    # Create new preset
    new_preset = {
        "name": "Teste Aciaria",
        "icon": "Flame",
        "color": "#ef4444",
        "is_default": False,
        "show_in_quickbar": True,
        "sort_order": 99,
        "filter_payload": {"functional_locations_prefixes": ["BT-ST-BOF1"]},
    }
    resp = await client.post("/api/v1/presets", json=new_preset, cookies=cookies, headers=headers)
    assert resp.status_code == 201
    created = resp.json()
    assert created["name"] == "Teste Aciaria"
    preset_id = created["id"]

    # Update preset
    resp = await client.put(
        f"/api/v1/presets/{preset_id}",
        json={"name": "Teste Aciaria Atualizado"},
        cookies=cookies,
        headers=headers,
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Teste Aciaria Atualizado"

    # Delete preset
    resp = await client.delete(f"/api/v1/presets/{preset_id}", cookies=cookies, headers=headers)
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_report_templates_and_generation(client: AsyncClient):
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = login_resp.cookies
    headers = {"X-ATC-Client": "web"}

    # Fields
    resp = await client.get("/api/v1/report-fields", cookies=cookies)
    assert resp.status_code == 200
    fields = resp.json()
    assert len(fields) >= 10

    # Templates
    resp = await client.get("/api/v1/report-templates", cookies=cookies)
    assert resp.status_code == 200
    templates = resp.json()
    assert len(templates) >= 3

    # Generate WhatsApp report (text)
    gen_req = {
        "format": "whatsapp",
        "header_title": "Relatório Matinal ATC",
        "scope": "all",
    }
    resp = await client.post("/api/v1/reports/generate", json=gen_req, cookies=cookies, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert "text" in data
    assert "RELATÓRIO MATINAL ATC" in data["text"]

    # Generate PDF report (bytes)
    gen_req_pdf = {
        "format": "pdf",
        "header_title": "Relatório PDF Executivo",
        "scope": "all",
    }
    resp = await client.post("/api/v1/reports/generate", json=gen_req_pdf, cookies=cookies, headers=headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content.startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_kpi_dashboards(client: AsyncClient):
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = login_resp.cookies

    resp = await client.get("/api/v1/dashboards/kpis", cookies=cookies)
    assert resp.status_code == 200
    kpis = resp.json()
    assert "total" in kpis
    assert "pane_count" in kpis
    assert "jump_count" in kpis
