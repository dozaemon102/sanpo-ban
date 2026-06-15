"""weight body composition columns

Revision ID: 003
Revises: 002
Create Date: 2026-06-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("weight_logs", sa.Column("bmi", sa.Numeric(4, 1), nullable=True))
    op.add_column("weight_logs", sa.Column("lbm_kg", sa.Numeric(5, 2), nullable=True))
    op.add_column("weight_logs", sa.Column("body_fat_pct", sa.Numeric(4, 1), nullable=True))


def downgrade() -> None:
    op.drop_column("weight_logs", "body_fat_pct")
    op.drop_column("weight_logs", "lbm_kg")
    op.drop_column("weight_logs", "bmi")
