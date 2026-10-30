"""add_functional_locations_table

Revision ID: a1b2c3d4e5f6
Revises: 844a460ffefc
Create Date: 2026-10-30 15:15:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '844a460ffefc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'functional_locations',
        sa.Column('full_code', sa.String(length=128), nullable=False),
        sa.Column('parent_code', sa.String(length=128), nullable=True),
        sa.Column('segment_code', sa.String(length=64), nullable=False),
        sa.Column('level', sa.Integer(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('custom_label', sa.String(length=128), nullable=True),
        sa.Column('arvore_planta', sa.String(length=32), nullable=True),
        sa.Column('occurrence_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='1'),
        sa.ForeignKeyConstraint(['parent_code'], ['functional_locations.full_code'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('full_code')
    )
    op.create_index(op.f('ix_functional_locations_parent_code'), 'functional_locations', ['parent_code'], unique=False)
    op.create_index(op.f('ix_functional_locations_level'), 'functional_locations', ['level'], unique=False)
    op.create_index(op.f('ix_functional_locations_arvore_planta'), 'functional_locations', ['arvore_planta'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_functional_locations_arvore_planta'), table_name='functional_locations')
    op.drop_index(op.f('ix_functional_locations_level'), table_name='functional_locations')
    op.drop_index(op.f('ix_functional_locations_parent_code'), table_name='functional_locations')
    op.drop_table('functional_locations')
