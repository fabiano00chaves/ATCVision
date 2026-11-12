from __future__ import annotations

from datetime import date, datetime, time
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import Occurrence, OccurrenceConfirmation
from app.db.session import async_session_factory
from app.services.occurrence_service import compute_confirmation_bounds


def test_compute_confirmation_bounds_combines_table_and_text_logs():
    class DummyConf:
        def __init__(self, d, t):
            self.data_execucao = d
            self.hora_execucao = t

    confs = [
        DummyConf(date(2026, 11, 10), time(0, 0, 0)),
        DummyConf(date(2026, 11, 10), time(0, 0, 0)),
    ]
    txt = "10.11.2026 16:35:05 99021165\nManobra realizada com sucesso.\n11.11.2026 02:15:00 TEST\nOk"
    cmin, cmax = compute_confirmation_bounds(confs, txt)
    assert cmin == datetime(2026, 11, 10, 16, 35, 5)
    assert cmax == datetime(2026, 11, 11, 2, 15, 0)


@pytest.mark.asyncio
async def test_date_reconciliation_sorting_location_count_and_meeting(client: AsyncClient):
    # 1. Seed controlled synthetic occurrences in DB
    async with async_session_factory() as db:
        occ_a = Occurrence(
            unique_sap_key="TEST_KEY_OCC_A",
            tipo_ocorrencia="NOTIFICACAO_GERAL",
            numero_nota="900005999001",
            numero_ordem="900039999001",
            titulo="Vazamento antigo confirmado hoje",
            data_abertura=date(2026, 11, 5),
            hora_abertura=time(10, 0, 0),
            abertura_timestamp=datetime(2026, 11, 5, 10, 0, 0),
            especialidade="MECANICA",
            arvore_planta="SLM1",
            posicao_funcional="BT-ST-SLM1-01-01",
            primeira_confirmacao_em=datetime(2026, 11, 10, 16, 35, 5),
            ultima_confirmacao_em=datetime(2026, 11, 10, 16, 35, 5),
            flag_destaque_reuniao=False,
        )
        occ_b = Occurrence(
            unique_sap_key="TEST_KEY_OCC_B",
            tipo_ocorrencia="CORRETIVA",
            numero_nota="900005999002",
            numero_ordem="900039999002",
            titulo="Falha aberta hoje sem confirmacao",
            data_abertura=date(2026, 11, 10),
            hora_abertura=time(14, 0, 0),
            abertura_timestamp=datetime(2026, 11, 10, 14, 0, 0),
            especialidade="ELETRICA",
            arvore_planta="BOF1",
            posicao_funcional="BT-ST-BOF1-02-01",
            flag_destaque_reuniao=True,
        )
        occ_c = Occurrence(
            unique_sap_key="TEST_KEY_OCC_C",
            tipo_ocorrencia="NOTIFICACAO_GERAL",
            numero_nota="900005999003",
            numero_ordem="900039999003",
            titulo="Segundo registro no mesmo local SLM1",
            data_abertura=date(2026, 11, 10),
            hora_abertura=time(9, 0, 0),
            abertura_timestamp=datetime(2026, 11, 10, 9, 0, 0),
            especialidade="MECANICA",
            arvore_planta="SLM1",
            posicao_funcional="BT-ST-SLM1-01-01",
            flag_destaque_reuniao=False,
        )
        occ_d = Occurrence(
            unique_sap_key="TEST_KEY_OCC_D",
            tipo_ocorrencia="NOTIFICACAO_GERAL",
            numero_nota="900005999004",
            numero_ordem="900039999004",
            titulo="Confirmacao meia-noite tabela SAP",
            data_abertura=date(2026, 11, 1),
            hora_abertura=time(8, 0, 0),
            abertura_timestamp=datetime(2026, 11, 1, 8, 0, 0),
            especialidade="MECANICA",
            arvore_planta="BOF1",
            posicao_funcional="BT-ST-BOF1-09-09",
            primeira_confirmacao_em=datetime(2026, 11, 10, 0, 0, 0),
            ultima_confirmacao_em=datetime(2026, 11, 10, 0, 0, 0),
        )
        db.add_all([occ_a, occ_b, occ_c, occ_d])
        await db.flush()
        db.add(
            OccurrenceConfirmation(
                occurrence_id=occ_d.id,
                data_execucao=date(2026, 11, 10),
                hora_execucao=time(0, 0, 0),
                nome_executante="TECNICO SAP",
                duracao_min=60,
            )
        )
        await db.commit()
        occ_a_id = occ_a.id
        occ_b_id = occ_b.id
        occ_c_id = occ_c.id
        occ_d_id = occ_d.id

    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
    )
    cookies = login_resp.cookies
    headers = {"X-ATC-Client": "web"}

    start_win = "2026-11-10T06:00:00"
    end_win = "2026-11-11T06:00:00"

    # A. date_mode = abertura (default) -> only occ_b and occ_c
    r_ab = await client.get(
        f"/api/v1/occurrences?start={start_win}&end={end_win}&date_mode=abertura",
        cookies=cookies,
    )
    assert r_ab.status_code == 200
    ab_ids = {x["id"] for x in r_ab.json()["items"]}
    assert occ_b_id in ab_ids and occ_c_id in ab_ids
    assert occ_a_id not in ab_ids and occ_d_id not in ab_ids

    # B. date_mode = confirmacao -> occ_a (16:35) and occ_d (SAP midnight on 10/11)
    r_cf = await client.get(
        f"/api/v1/occurrences?start={start_win}&end={end_win}&date_mode=confirmacao",
        cookies=cookies,
    )
    assert r_cf.status_code == 200
    cf_ids = {x["id"] for x in r_cf.json()["items"]}
    assert occ_a_id in cf_ids and occ_d_id in cf_ids
    assert occ_b_id not in cf_ids

    # C. date_mode = atividade (conciliated) -> A, B, C, D all appear!
    r_at = await client.get(
        f"/api/v1/occurrences?start={start_win}&end={end_win}&date_mode=atividade",
        cookies=cookies,
    )
    assert r_at.status_code == 200
    at_ids = {x["id"] for x in r_at.json()["items"]}
    assert {occ_a_id, occ_b_id, occ_c_id, occ_d_id}.issubset(at_ids)

    # D. Sorting checks: arvore_asc places BOF1 before SLM1
    r_sort_tree = await client.get(
        "/api/v1/occurrences?sort=arvore_asc&limit=50",
        cookies=cookies,
    )
    assert r_sort_tree.status_code == 200
    items_tree = r_sort_tree.json()["items"]
    bof_idxs = [i for i, x in enumerate(items_tree) if x["arvore_planta"] == "BOF1"]
    slm_idxs = [i for i, x in enumerate(items_tree) if x["arvore_planta"] == "SLM1"]
    assert max(bof_idxs) < min(slm_idxs)

    # E. Same-location recurrence count on BT-ST-SLM1-01-01 must be 2
    slm_items = [x for x in items_tree if x["posicao_funcional"] == "BT-ST-SLM1-01-01"]
    assert len(slm_items) >= 2
    assert all(x["same_location_count"] >= 2 for x in slm_items)

    # F. Sequential sorting: data_asc_arvore orders by date ASC then tree ASC (occ_d 11/01 -> occ_a 11/05 -> occ_b BOF1 11/10 -> occ_c SLM1 11/10)
    r_seq = await client.get("/api/v1/occurrences?sort=data_asc_arvore&limit=50", cookies=cookies)
    assert r_seq.status_code == 200
    seq_ids = [x["id"] for x in r_seq.json()["items"]]
    assert seq_ids.index(occ_d_id) < seq_ids.index(occ_a_id) < seq_ids.index(occ_b_id) < seq_ids.index(occ_c_id)

    # G. Daily Meeting flag patch, filter, report export (scope=meeting), and clear
    r_patch = await client.patch(
        f"/api/v1/occurrences/{occ_a_id}",
        json={"flag_destaque_reuniao": True},
        cookies=cookies,
        headers=headers,
    )
    assert r_patch.status_code == 200
    assert r_patch.json()["flag_destaque_reuniao"] is True

    r_meet = await client.get("/api/v1/occurrences?only_meeting=true", cookies=cookies)
    assert r_meet.status_code == 200
    meet_ids = {x["id"] for x in r_meet.json()["items"]}
    assert occ_a_id in meet_ids and occ_b_id in meet_ids
    assert occ_c_id not in meet_ids

    r_rep = await client.post(
        "/api/v1/reports/generate",
        json={"format": "whatsapp", "scope": "meeting", "header_title": "Pauta Teste"},
        cookies=cookies,
        headers=headers,
    )
    assert r_rep.status_code == 200
    assert r_rep.json()["count"] >= 2

    r_clear = await client.post("/api/v1/occurrences/meeting/clear", cookies=cookies, headers=headers)
    assert r_clear.status_code == 200
    r_meet_after = await client.get("/api/v1/occurrences?only_meeting=true", cookies=cookies)
    assert r_meet_after.json()["total"] == 0
