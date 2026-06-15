"""meal_slot on meal_logs

Revision ID: 006
Revises: 005
Create Date: 2026-06-15
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "meal_logs",
        sa.Column(
            "meal_slot",
            sa.Enum("breakfast", "lunch", "dinner", "snack", name="meal_slot_enum"),
            nullable=False,
            server_default="snack",
        ),
    )
    op.alter_column("meal_logs", "meal_slot", server_default=None)


def downgrade() -> None:
    op.drop_column("meal_logs", "meal_slot")
