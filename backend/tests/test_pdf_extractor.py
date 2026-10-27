from __future__ import annotations

try:
    import pymupdf as fitz
except ImportError:
    import fitz
import pytest

from app.services.pdf_extractor import (
    arvore_from_fl,
    clean_spaces,
    extract_from_document,
    normalize_functional_location,
    normalize_number,
    normalize_planning_group,
    normalize_turno,
    parse_date,
    parse_datetime,
    parse_minutes,
    parse_time,
)


def test_normalizations():
    # Number normalization
    assert normalize_number("90003949961.0") == "900039499610"
    assert normalize_number("900005123456") == "900005123456"
    assert normalize_number("123") is None

    # Functional location normalization
    assert normalize_functional_location("BT-ST-SLMI-21-13-02-7B") == "BT-ST-SLM1-21-13-02-7B"
    assert normalize_functional_location("BT-ST-COMO-01-02") == "BT-ST-COM0-01-02"
    assert normalize_functional_location("BT-ST-BOFI-10") == "BT-ST-BOF1-10"
    assert normalize_functional_location("BT-ST-CCSI-05") == "BT-ST-CCS1-05"
    assert arvore_from_fl("BT-ST-SLM1-21-13-02-7B") == "SLM1"
    assert arvore_from_fl("BT-ST-BOF1-10") == "BOF1"

    # Planning group normalization
    assert normalize_planning_group("058/ ATOO") == "058/AT00"
    assert normalize_planning_group("184/ AT0O") == "184/AT00"
    assert normalize_planning_group("068 ATOO") == "068/AT00"

    # Turno normalization
    assert normalize_turno("Turno A") == "Turno A"
    assert normalize_turno("A") == "Turno A"
    assert normalize_turno("D - Dia") == "D Dia"
    assert normalize_turno("N - Noite") == "N Noite"

    # Time / Date
    assert parse_date("26.10.2026") is not None
    assert parse_time("06:30") is not None
    assert parse_minutes("90 MIN") == 90.0
    assert parse_minutes("1,5 H") == 90.0


def test_extraction_all_four_sap_pm_types():
    # Create an in-memory PDF with all 4 SAP PM variations across 2 pages
    doc = fitz.open()

    # Page 1
    p1 = doc.new_page(width=595, height=842)
    # Header noise
    p1.insert_text((36, 36), "ArcelorMittal Tubarão", fontsize=10)
    p1.insert_text((36, 50), "Relatório diário de turno : Data: 26.10.2026 06:00:00 até 27.10.2026 06:00:00", fontsize=10)

    # 1. Corretiva
    p1.insert_text((36, 90), "900005111111 Falha no virador de panela  Manut. Corr.-Mau func.  Imediato", fontsize=9)
    p1.insert_text((36, 105), "Ordem : 900039111111   Status : LIBE CONF   Prioridade : Imediato", fontsize=9)
    p1.insert_text((36, 120), "Data da abertura : 26.10.2026  Creation Time : 08:30:00   Turno : Turno A", fontsize=9)
    p1.insert_text((36, 135), "Reportado por : STGEET01   Grupo de planejamento : 058/ ATOO", fontsize=9)
    p1.insert_text((36, 150), "Posição funcional : BT-ST-SLMI-21-13-02-7B Virador de Panela", fontsize=9)
    p1.insert_text((36, 165), "Defeito : Curto-circuito   Causa : Cabo rompido por fagulha", fontsize=9)
    p1.insert_text((36, 180), "Início da avaria : 26.10.2026 08:30:00   Fim da avaria : 26.10.2026 09:30:00", fontsize=9)
    p1.insert_text((36, 195), "Tempo da pane : 60 MIN", fontsize=9)
    p1.insert_text((36, 210), "Descrição longa da notificação :", fontsize=9)
    p1.insert_text((36, 225), "Virador parou durante basculamento. Realizada troca do chicote do sensor.", fontsize=9)
    p1.insert_text((36, 245), "Confirmações :", fontsize=9)
    p1.insert_text((36, 260), "26.10.2026 09:30 TURNO ELET ACIA 12345 João Silva 60 MIN", fontsize=9)

    # 2. Notificação Geral (Edge Rule 1: nota one line ABOVE marker)
    p1.insert_text((36, 300), "900005222222 Inspeção dos bornes de aterramento", fontsize=9)
    p1.insert_text((36, 315), "Notificação geral  Geral   Serviços auxiliares e administrativos", fontsize=9)
    p1.insert_text((36, 330), "Ordem : 900039222222   Status : LIBE   Prioridade : Geral", fontsize=9)
    p1.insert_text((36, 345), "Data da abertura : 26.10.2026  Creation Time : 10:00:00   Turno : Turno B", fontsize=9)
    p1.insert_text((36, 360), "Reportado por : STGEMT01   Grupo de planejamento : 184/ AT0O", fontsize=9)
    p1.insert_text((36, 375), "Posição funcional : BT-ST-BOFI-01-02-03 Clarificador", fontsize=9)

    # Page 1 footer noise
    p1.insert_text((500, 820), "1 / 2", fontsize=9)

    # Page 2
    p2 = doc.new_page(width=595, height=842)

    # 3. Preventiva Baseada em Condição
    p2.insert_text((36, 50), "900005333333 Manut. Prev. Bas. Co.  Revisão semestral do carro de transferência", fontsize=9)
    p2.insert_text((36, 65), "Ordem : 900039333333   Status : LIBE   Prioridade : Normal", fontsize=9)
    p2.insert_text((36, 80), "Data da abertura : 26.10.2026  Creation Time : 14:00:00   Turno : Turno C", fontsize=9)
    p2.insert_text((36, 95), "Reportado por : STGEET01   Grupo de planejamento : 058/AT00", fontsize=9)
    p2.insert_text((36, 110), "Posição funcional : BT-ST-CCSI-05-10-00 Carro Transferência", fontsize=9)
    p2.insert_text((36, 125), "Operações :", fontsize=9)
    p2.insert_text((36, 140), "0010 Bloqueio de energia conforme Regras de Ouro", fontsize=9)
    p2.insert_text((36, 155), "0020 Lubrificação das guias e teste de isolação", fontsize=9)
    p2.insert_text((36, 175), "By-pass ou Jumps Anormais : Jumper provisório no sensor fim de curso da tampa", fontsize=9)

    # 4. Preventiva Tempo/Contador (Edge Rule 2: NO NOTA, uses Data de início and Centro de trabalho)
    p2.insert_text((36, 230), "Manut Prev (tempo/contador)  Troca periódica de filtro de ar", fontsize=9)
    p2.insert_text((36, 245), "Ordem : 900039444444   Status : LIBE", fontsize=9)
    p2.insert_text((36, 260), "Data de início : 26.10.2026  Hora de início : 16:00:00   Turno : D - Dia", fontsize=9)
    p2.insert_text((36, 275), "Centro de trabalho : STGEMT01   Grupo de planejamento : 068 ATOO", fontsize=9)
    p2.insert_text((36, 290), "Posição funcional : BT-ST-COM0-01-01 Compressor Central", fontsize=9)

    # Page 2 footer noise
    p2.insert_text((500, 820), "2 / 2", fontsize=9)

    result = extract_from_document(doc)
    assert result.page_count == 2
    assert len(result.occurrences) == 4

    # Verify occurrence 1 (Corretiva)
    occ1 = next(o for o in result.occurrences if o.numero_ordem == "900039111111")
    assert occ1.tipo_ocorrencia == "CORRETIVA"
    assert occ1.numero_nota == "900005111111"
    assert occ1.posicao_funcional == "BT-ST-SLM1-21-13-02-7B"  # Prefix fixed
    assert occ1.arvore_planta == "SLM1"
    assert occ1.teve_pane is True
    assert occ1.duracao_pane_min == 60.0
    assert occ1.especialidade == "ELETRICA"
    assert "field_bboxes" in occ1.to_dict()
    assert "posicao_funcional" in occ1.field_bboxes

    # Verify occurrence 2 (Notificação Geral with lookahead nota)
    occ2 = next(o for o in result.occurrences if o.numero_ordem == "900039222222")
    assert occ2.tipo_ocorrencia == "NOTIFICACAO_GERAL"
    assert occ2.numero_nota == "900005222222"
    assert occ2.posicao_funcional == "BT-ST-BOF1-01-02-03"  # Prefix fixed
    assert occ2.especialidade == "MECANICA"

    # Verify occurrence 3 (Preventiva Condicional with Operations and Jump)
    occ3 = next(o for o in result.occurrences if o.numero_ordem == "900039333333")
    assert occ3.tipo_ocorrencia == "PREVENTIVA_CONDICAO"
    assert occ3.tem_jump_force is True
    assert "Jumper provisório" in (occ3.detalhe_jump_tarefas or "")
    assert len(occ3.operacoes) >= 2

    # Verify occurrence 4 (Preventiva Tempo/Contador without Nota)
    occ4 = next(o for o in result.occurrences if o.numero_ordem == "900039444444")
    assert occ4.tipo_ocorrencia == "PREVENTIVA_TEMPO"
    assert occ4.numero_nota is None
    assert occ4.turno == "D Dia"
    assert occ4.posicao_funcional == "BT-ST-COM0-01-01"
