"""walk MET params on profile and daily_steps

Revision ID: 005
Revises: 004
Create Date: 2026-06-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_profile",
        sa.Column("stride_cm", sa.Numeric(5, 2), nullable=True),
    )
    op.add_column(
        "user_profile",
        sa.Column("walking_speed_kmh", sa.Numeric(4, 2), nullable=True),
    )
    op.add_column(
        "daily_steps",
        sa.Column("stride_cm", sa.Numeric(5, 2), nullable=True),
    )
    op.add_column(
        "daily_steps",
        sa.Column("walking_speed_kmh", sa.Numeric(4, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("daily_steps", "walking_speed_kmh")
    op.drop_column("daily_steps", "stride_cm")
    op.drop_column("user_profile", "walking_speed_kmh")
    op.drop_column("user_profile", "stride_cm")
