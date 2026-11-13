"""add_reuniao_and_confirmacao_columns

Revision ID: c2d3e4f5a6b7
Revises: a1b2c3d4e5f6
Create Date: 2026-11-12 18:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns to occurrences if missing
    op.add_column(
        'occurrences',
        sa.Column('flag_destaque_reuniao', sa.Boolean(), nullable=False, server_default=sa.text('false'))
    )
    op.add_column(
        'occurrences',
        sa.Column('primeira_confirmacao_em', sa.DateTime(), nullable=True)
    )
    op.add_column(
        'occurrences',
        sa.Column('ultima_confirmacao_em', sa.DateTime(), nullable=True)
    )

    # 2. Add performance indexes
    op.create_index(
        'ix_occurrences_flag_destaque_reuniao',
        'occurrences',
        ['flag_destaque_reuniao'],
        unique=False
    )
    op.create_index(
        'ix_occurrences_ultima_confirmacao_em',
        'occurrences',
        ['ultima_confirmacao_em'],
        unique=False
    )
    op.create_index(
        'idx_occurrences_confirmacao_esp',
        'occurrences',
        ['ultima_confirmacao_em', 'especialidade'],
        unique=False
    )
    op.create_index(
        'idx_occurrences_reuniao_abertura',
        'occurrences',
        ['flag_destaque_reuniao', 'abertura_timestamp'],
        unique=False
    )

    # 3. Allow pdf_documents.storage_path to be nullable when physical binaries are purged
    try:
        op.alter_column('pdf_documents', 'storage_path', existing_type=sa.String(length=512), nullable=True)
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.alter_column('pdf_documents', 'storage_path', existing_type=sa.String(length=512), nullable=False)
    except Exception:
        pass

    op.drop_index('idx_occurrences_reuniao_abertura', table_name='occurrences')
    op.drop_index('idx_occurrences_confirmacao_esp', table_name='occurrences')
    op.drop_index('ix_occurrences_ultima_confirmacao_em', table_name='occurrences')
    op.drop_index('ix_occurrences_flag_destaque_reuniao', table_name='occurrences')

    op.drop_column('occurrences', 'ultima_confirmacao_em')
    op.drop_column('occurrences', 'primeira_confirmacao_em')
    op.drop_column('occurrences', 'flag_destaque_reuniao')
