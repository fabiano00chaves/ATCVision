from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import FunctionalLocation, Occurrence
from app.schemas.functional_location import FunctionalLocationUpdate

log = logging.getLogger("atc.functional_locations")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def decompose_functional_location(
    raw_code: str,
    description: Optional[str] = None,
    arvore_planta: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Decomposes a functional location string into its hierarchical levels.
    Example:
        'BT-ST-SLM1-21-13-02'
        -> Level 1: BT (parent: None)
        -> Level 2: BT-ST (parent: BT)
        -> Level 3: BT-ST-SLM1 (parent: BT-ST, arvore: SLM1)
        -> Level 4: BT-ST-SLM1-21 (parent: BT-ST-SLM1, arvore: SLM1)
        -> Level 5: BT-ST-SLM1-21-13 (parent: BT-ST-SLM1-21, arvore: SLM1)
        -> Level 6: BT-ST-SLM1-21-13-02 (parent: BT-ST-SLM1-21-13, arvore: SLM1, desc: description)
    """
    if not raw_code:
        return []

    cleaned = raw_code.strip().upper()
    parts = [p.strip() for p in cleaned.split("-") if p.strip()]
    if not parts:
        return []

    nodes: List[Dict[str, Any]] = []
    num_parts = len(parts)

    for i in range(num_parts):
        segment = parts[i]
        full_code = "-".join(parts[: i + 1])
        parent_code = "-".join(parts[:i]) if i > 0 else None
        level = i + 1
        is_terminal = (i == num_parts - 1)

        # Plant tree heuristic (SLM1, SLM2, LAM1, etc.)
        node_arvore: Optional[str] = None
        if arvore_planta:
            node_arvore = arvore_planta
        elif num_parts >= 3 and i >= 2:
            node_arvore = parts[2]
        elif num_parts < 3 and arvore_planta:
            node_arvore = arvore_planta

        node_desc = description.strip() if (is_terminal and description and description.strip()) else None

        nodes.append({
            "full_code": full_code,
            "parent_code": parent_code,
            "segment_code": segment,
            "level": level,
            "description": node_desc,
            "arvore_planta": node_arvore,
            "is_terminal": is_terminal,
        })

    return nodes


async def learn_functional_locations_batch(
    db: AsyncSession,
    items: List[Dict[str, Any]],
) -> int:
    """
    Learns functional locations from a batch of occurrences.
    items: List of dicts with keys: 'code', 'description', 'arvore_planta'.
    Returns number of distinct functional location nodes processed.
    """
    if not items:
        return 0

    decomposed_nodes: Dict[str, Dict[str, Any]] = {}
    terminal_counts: Dict[str, int] = {}

    for item in items:
        raw_code = item.get("code")
        if not raw_code:
            continue
        desc = item.get("description")
        arvore = item.get("arvore_planta")

        nodes = decompose_functional_location(raw_code, description=desc, arvore_planta=arvore)
        if not nodes:
            continue

        terminal_code = nodes[-1]["full_code"]
        terminal_counts[terminal_code] = terminal_counts.get(terminal_code, 0) + 1

        for n in nodes:
            code = n["full_code"]
            if code not in decomposed_nodes:
                decomposed_nodes[code] = n
            else:
                # Merge description if new one is richer
                existing = decomposed_nodes[code]
                if n["description"] and (not existing["description"] or len(n["description"]) > len(existing["description"])):
                    existing["description"] = n["description"]
                if n["arvore_planta"] and not existing["arvore_planta"]:
                    existing["arvore_planta"] = n["arvore_planta"]

    if not decomposed_nodes:
        return 0

    all_codes = list(decomposed_nodes.keys())
    res = await db.execute(
        select(FunctionalLocation).where(FunctionalLocation.full_code.in_(all_codes))
    )
    existing_map: Dict[str, FunctionalLocation] = {node.full_code: node for node in res.scalars().all()}

    now = utc_now()
    # Group nodes by level to guarantee topological insertion order
    nodes_by_level: Dict[int, List[Dict[str, Any]]] = {}
    for n in decomposed_nodes.values():
        nodes_by_level.setdefault(n["level"], []).append(n)

    sorted_levels = sorted(nodes_by_level.keys())

    for lvl in sorted_levels:
        for node_data in nodes_by_level[lvl]:
            code = node_data["full_code"]
            term_inc = terminal_counts.get(code, 0)

            if code in existing_map:
                existing = existing_map[code]
                existing.last_seen_at = now
                if term_inc > 0:
                    existing.occurrence_count += term_inc
                if node_data["description"] and (not existing.description or len(node_data["description"]) > len(existing.description)):
                    existing.description = node_data["description"]
                if node_data["arvore_planta"] and not existing.arvore_planta:
                    existing.arvore_planta = node_data["arvore_planta"]
            else:
                new_fl = FunctionalLocation(
                    full_code=code,
                    parent_code=node_data["parent_code"],
                    segment_code=node_data["segment_code"],
                    level=node_data["level"],
                    description=node_data["description"],
                    custom_label=None,
                    arvore_planta=node_data["arvore_planta"],
                    occurrence_count=term_inc,
                    first_seen_at=now,
                    last_seen_at=now,
                    is_active=True,
                )
                db.add(new_fl)
                existing_map[code] = new_fl
        await db.flush()

    return len(decomposed_nodes)


async def learn_single_functional_location(
    db: AsyncSession,
    code: str,
    description: Optional[str] = None,
    arvore_planta: Optional[str] = None,
) -> None:
    await learn_functional_locations_batch(
        db,
        [{"code": code, "description": description, "arvore_planta": arvore_planta}],
    )


async def rebuild_tree_from_db(db: AsyncSession) -> Dict[str, Any]:
    """
    Reconstructs the functional location tree from all existing occurrences in the database.
    Preserves existing custom_labels and is_active overrides.
    """
    # 1. Query all occurrences with posicao_funcional
    stmt = (
        select(
            Occurrence.posicao_funcional,
            Occurrence.descricao_posicao_funcional,
            Occurrence.descricao_curta_objeto,
            Occurrence.arvore_planta,
        )
        .where(Occurrence.posicao_funcional.isnot(None))
        .where(Occurrence.posicao_funcional != "")
    )
    result = await db.execute(stmt)
    rows = result.all()

    scanned_count = len(rows)
    items: List[Dict[str, Any]] = []

    for r in rows:
        code = r[0]
        desc = r[1] or r[2] or None
        arvore = r[3] or None
        items.append({"code": code, "description": desc, "arvore_planta": arvore})

    # 2. Backup existing custom_labels and flags
    existing_custom_labels: Dict[str, Optional[str]] = {}
    existing_active_flags: Dict[str, bool] = {}
    fl_stmt = select(FunctionalLocation.full_code, FunctionalLocation.custom_label, FunctionalLocation.is_active)
    fl_res = await db.execute(fl_stmt)
    for code, label, is_act in fl_res.all():
        if label:
            existing_custom_labels[code] = label
        existing_active_flags[code] = is_act

    # 3. Reset existing occurrence counts to 0
    await db.execute(
        FunctionalLocation.__table__.update().values(occurrence_count=0)
    )

    # 4. Process all occurrences into tree nodes
    total_nodes = await learn_functional_locations_batch(db, items)

    # 5. Restore custom_labels and active flags
    for code, label in existing_custom_labels.items():
        fl_node = await db.get(FunctionalLocation, code)
        if fl_node:
            fl_node.custom_label = label
    for code, is_act in existing_active_flags.items():
        fl_node = await db.get(FunctionalLocation, code)
        if fl_node:
            fl_node.is_active = is_act

    await db.commit()

    # Calculate max depth
    depth_res = await db.execute(select(func.max(FunctionalLocation.level)))
    max_depth = depth_res.scalar() or 0

    return {
        "scanned_occurrences": scanned_count,
        "total_nodes": total_nodes,
        "max_depth": max_depth,
        "message": f"Árvore reconstruída com sucesso a partir de {scanned_count} ocorrências.",
        "ok": True,
    }


async def get_tree(
    db: AsyncSession,
    root_code: Optional[str] = None,
    arvore_planta: Optional[str] = None,
    max_depth: Optional[int] = None,
    search: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Returns the hierarchical tree of functional locations with rolled-up occurrence counts.
    """
    query = select(FunctionalLocation).where(FunctionalLocation.is_active.is_(True))
    if max_depth:
        query = query.where(FunctionalLocation.level <= max_depth)

    res = await db.execute(query.order_by(FunctionalLocation.level.asc(), FunctionalLocation.full_code.asc()))
    all_nodes = res.scalars().all()

    if not all_nodes:
        return []

    # Map nodes to dictionary structures
    node_map: Dict[str, Dict[str, Any]] = {}
    for n in all_nodes:
        node_map[n.full_code] = {
            "full_code": n.full_code,
            "parent_code": n.parent_code,
            "segment_code": n.segment_code,
            "level": n.level,
            "description": n.description,
            "custom_label": n.custom_label,
            "arvore_planta": n.arvore_planta,
            "occurrence_count": n.occurrence_count,
            "total_occurrences": n.occurrence_count,
            "children_count": 0,
            "first_seen_at": n.first_seen_at,
            "last_seen_at": n.last_seen_at,
            "is_active": n.is_active,
            "children": [],
        }

    # Group children and calculate rolled up counts from bottom to top
    sorted_by_level_desc = sorted(node_map.values(), key=lambda x: x["level"], reverse=True)
    for n in sorted_by_level_desc:
        p_code = n["parent_code"]
        if p_code and p_code in node_map:
            parent = node_map[p_code]
            parent["children"].append(n)
            parent["total_occurrences"] += n["total_occurrences"]
            parent["children_count"] += 1

    # Sort children in each node alphabetically
    for n in node_map.values():
        n["children"].sort(key=lambda c: c["full_code"])

    # Determine root nodes
    if root_code:
        clean_root = root_code.strip().upper()
        if clean_root in node_map:
            roots = [node_map[clean_root]]
        else:
            roots = [n for n in node_map.values() if n["full_code"].startswith(clean_root) and n["level"] == 1]
    else:
        # Default roots are level 1 (or nodes with no parent in node_map)
        roots = [n for n in node_map.values() if not n["parent_code"] or n["parent_code"] not in node_map]

    # Filter by arvore_planta if specified
    if arvore_planta:
        clean_arv = arvore_planta.strip().upper()
        filtered_roots: List[Dict[str, Any]] = []

        def matches_or_has_arvore(node: Dict[str, Any]) -> bool:
            if node.get("arvore_planta") == clean_arv or node.get("segment_code") == clean_arv:
                return True
            return any(matches_or_has_arvore(child) for child in node["children"])

        def prune_by_arvore(node: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            if not matches_or_has_arvore(node):
                return None
            pruned_children = [
                pruned for child in node["children"]
                if (pruned := prune_by_arvore(child)) is not None
            ]
            node_copy = dict(node)
            node_copy["children"] = pruned_children
            return node_copy

        for r in roots:
            pruned = prune_by_arvore(r)
            if pruned:
                filtered_roots.append(pruned)
        roots = filtered_roots

    # Filter by search if specified
    if search:
        s_clean = search.strip().upper()
        searched_roots: List[Dict[str, Any]] = []

        def matches_search(node: Dict[str, Any]) -> bool:
            if s_clean in node["full_code"].upper():
                return True
            if node["description"] and s_clean in node["description"].upper():
                return True
            if node["custom_label"] and s_clean in node["custom_label"].upper():
                return True
            return False

        def filter_node_search(node: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            self_match = matches_search(node)
            filtered_children = [
                filtered for child in node["children"]
                if (filtered := filter_node_search(child)) is not None
            ]
            if self_match or filtered_children:
                node_copy = dict(node)
                node_copy["children"] = filtered_children
                return node_copy
            return None

        for r in roots:
            filtered = filter_node_search(r)
            if filtered:
                searched_roots.append(filtered)
        roots = searched_roots

    return roots


async def search_nodes(
    db: AsyncSession,
    query: str,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """
    Searches functional location nodes for autocomplete/pickers.
    """
    clean_q = query.strip()
    if not clean_q:
        stmt = (
            select(FunctionalLocation)
            .where(FunctionalLocation.is_active.is_(True))
            .order_by(FunctionalLocation.occurrence_count.desc(), FunctionalLocation.level.asc())
            .limit(limit)
        )
    else:
        like_pattern = f"%{clean_q}%"
        stmt = (
            select(FunctionalLocation)
            .where(FunctionalLocation.is_active.is_(True))
            .where(
                or_(
                    FunctionalLocation.full_code.ilike(like_pattern),
                    FunctionalLocation.description.ilike(like_pattern),
                    FunctionalLocation.custom_label.ilike(like_pattern),
                )
            )
            .order_by(FunctionalLocation.occurrence_count.desc(), FunctionalLocation.level.asc())
            .limit(limit)
        )

    res = await db.execute(stmt)
    nodes = res.scalars().all()
    return [
        {
            "full_code": n.full_code,
            "parent_code": n.parent_code,
            "segment_code": n.segment_code,
            "level": n.level,
            "description": n.description,
            "custom_label": n.custom_label,
            "arvore_planta": n.arvore_planta,
            "occurrence_count": n.occurrence_count,
            "total_occurrences": n.occurrence_count,
            "children_count": 0,
            "first_seen_at": n.first_seen_at,
            "last_seen_at": n.last_seen_at,
            "is_active": n.is_active,
        }
        for n in nodes
    ]


async def update_node(
    db: AsyncSession,
    full_code: str,
    payload: FunctionalLocationUpdate,
) -> Optional[FunctionalLocation]:
    """
    Updates custom_label, description or active status of a functional location node.
    """
    node = await db.get(FunctionalLocation, full_code.strip().upper())
    if not node:
        return None

    if payload.custom_label is not None:
        node.custom_label = payload.custom_label.strip() if payload.custom_label.strip() else None
    if payload.description is not None:
        node.description = payload.description.strip() if payload.description.strip() else None
    if payload.is_active is not None:
        node.is_active = payload.is_active

    await db.commit()
    await db.refresh(node)
    return node


async def get_node(
    db: AsyncSession,
    full_code: str,
) -> Optional[Dict[str, Any]]:
    """
    Retrieves a single functional location node by full_code with direct child counts.
    """
    clean_code = full_code.strip().upper()
    node = await db.get(FunctionalLocation, clean_code)
    if not node:
        return None

    # Count children
    children_res = await db.execute(
        select(func.count(FunctionalLocation.full_code)).where(
            FunctionalLocation.parent_code == clean_code,
            FunctionalLocation.is_active.is_(True),
        )
    )
    children_count = children_res.scalar() or 0

    return {
        "full_code": node.full_code,
        "parent_code": node.parent_code,
        "segment_code": node.segment_code,
        "level": node.level,
        "description": node.description,
        "custom_label": node.custom_label,
        "arvore_planta": node.arvore_planta,
        "occurrence_count": node.occurrence_count,
        "total_occurrences": node.occurrence_count,
        "children_count": children_count,
        "first_seen_at": node.first_seen_at,
        "last_seen_at": node.last_seen_at,
        "is_active": node.is_active,
    }
