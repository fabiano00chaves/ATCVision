from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.functional_location import (
    FunctionalLocationNodeOut,
    FunctionalLocationRebuildOut,
    FunctionalLocationTreeNodeOut,
    FunctionalLocationUpdate,
)
from app.services import functional_location_service

router = APIRouter()


@router.get("/tree", response_model=List[FunctionalLocationTreeNodeOut])
async def get_functional_location_tree(
    root_code: Optional[str] = Query(None, description="Filtrar subárvore a partir de um código raiz"),
    arvore_planta: Optional[str] = Query(None, description="Filtrar por árvore de planta (ex: SLM1, LAM1)"),
    max_depth: Optional[int] = Query(None, ge=1, le=10, description="Profundidade máxima de níveis"),
    search: Optional[str] = Query(None, description="Filtro de busca textual"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Retorna a árvore hierárquica completa de posições funcionais com contagens agregadas de ocorrências.
    """
    tree = await functional_location_service.get_tree(
        db,
        root_code=root_code,
        arvore_planta=arvore_planta,
        max_depth=max_depth,
        search=search,
    )
    return tree


@router.get("/search", response_model=List[FunctionalLocationNodeOut])
async def search_functional_locations(
    q: str = Query("", description="Termo de pesquisa (código, descrição ou rótulo customizado)"),
    limit: int = Query(50, ge=1, le=200, description="Limite máximo de resultados"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pesquisa posições funcionais por prefixo, código ou descrição para preenchimento rápido (autocomplete).
    """
    return await functional_location_service.search_nodes(db, query=q, limit=limit)


@router.patch("/nodes/{code:path}", response_model=FunctionalLocationNodeOut)
async def update_functional_location_node(
    code: str,
    payload: FunctionalLocationUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Atualiza rótulo amigável (custom_label), descrição ou status de visibilidade de um nó da árvore.
    """
    node = await functional_location_service.update_node(db, full_code=code, payload=payload)
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Posição funcional '{code}' não encontrada.",
        )
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
        "children_count": 0,
        "first_seen_at": node.first_seen_at,
        "last_seen_at": node.last_seen_at,
        "is_active": node.is_active,
    }


@router.post("/rebuild", response_model=FunctionalLocationRebuildOut)
async def rebuild_functional_location_tree(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Varre retroativamente todo o banco de ocorrências para construir ou sincronizar a árvore hierárquica.
    """
    result = await functional_location_service.rebuild_tree_from_db(db)
    return result
