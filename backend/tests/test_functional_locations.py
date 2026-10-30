from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.models import FunctionalLocation, Occurrence
from app.services.functional_location_service import (
    decompose_functional_location,
    learn_functional_locations_batch,
    rebuild_tree_from_db,
)


def test_decompose_functional_location():
    # Standard SAP PM plant code
    raw = "BT-ST-SLM1-21-13-02"
    nodes = decompose_functional_location(raw, description="Motor Rolos Mesa", arvore_planta=None)

    assert len(nodes) == 6
    assert nodes[0]["full_code"] == "BT"
    assert nodes[0]["level"] == 1
    assert nodes[0]["parent_code"] is None
    assert nodes[0]["arvore_planta"] is None
    assert nodes[0]["is_terminal"] is False

    assert nodes[1]["full_code"] == "BT-ST"
    assert nodes[1]["level"] == 2
    assert nodes[1]["parent_code"] == "BT"

    assert nodes[2]["full_code"] == "BT-ST-SLM1"
    assert nodes[2]["level"] == 3
    assert nodes[2]["parent_code"] == "BT-ST"
    assert nodes[2]["arvore_planta"] == "SLM1"

    assert nodes[3]["full_code"] == "BT-ST-SLM1-21"
    assert nodes[3]["level"] == 4
    assert nodes[3]["arvore_planta"] == "SLM1"

    assert nodes[5]["full_code"] == "BT-ST-SLM1-21-13-02"
    assert nodes[5]["level"] == 6
    assert nodes[5]["parent_code"] == "BT-ST-SLM1-21-13"
    assert nodes[5]["arvore_planta"] == "SLM1"
    assert nodes[5]["description"] == "Motor Rolos Mesa"
    assert nodes[5]["is_terminal"] is True


@pytest.mark.asyncio
async def test_api_functional_locations_tree_and_rebuild(client: AsyncClient):
    # Log in as admin
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": settings.ADMIN_EMAIL, "password": settings.ADMIN_PASSWORD},
        headers={"X-ATC-Client": "web"},
    )
    assert login_resp.status_code == 200
    cookies = login_resp.cookies

    # 1. Trigger rebuild from existing seeded occurrences
    rebuild_resp = await client.post(
        "/api/v1/functional-locations/rebuild",
        cookies=cookies,
        headers={"X-ATC-Client": "web"},
    )
    assert rebuild_resp.status_code == 200
    rebuild_data = rebuild_resp.json()
    assert rebuild_data["ok"] is True
    assert rebuild_data["scanned_occurrences"] >= 0

    # 2. Query tree
    tree_resp = await client.get(
        "/api/v1/functional-locations/tree",
        cookies=cookies,
    )
    assert tree_resp.status_code == 200
    tree = tree_resp.json()
    assert isinstance(tree, list)

    # 3. Search endpoint
    search_resp = await client.get(
        "/api/v1/functional-locations/search?q=BT",
        cookies=cookies,
    )
    assert search_resp.status_code == 200
    search_results = search_resp.json()
    assert isinstance(search_results, list)

    if search_results:
        first_code = search_results[0]["full_code"]
        # 4. Patch node custom_label
        patch_resp = await client.patch(
            f"/api/v1/functional-locations/nodes/{first_code}",
            json={"custom_label": "Área de Teste Rotulada"},
            cookies=cookies,
            headers={"X-ATC-Client": "web"},
        )
        assert patch_resp.status_code == 200
        patched_data = patch_resp.json()
        assert patched_data["custom_label"] == "Área de Teste Rotulada"
