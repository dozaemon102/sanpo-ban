"""v3 kenko-kanri profile and drop walks

Revision ID: 004
Revises: 003
Create Date: 2026-06-14
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("idx_walk_sessions_walked_at", table_name="walk_sessions")
    op.drop_table("walk_sessions")

    op.drop_column("user_profile", "activity_factor")
    op.drop_column("user_profile", "target_kcal")
    op.drop_column("user_profile", "target_protein_g")
    op.drop_column("user_profile", "target_fat_g")
    op.drop_column("user_profile", "target_carbs_g")

    op.add_column(
        "user_profile",
        sa.Column("neat_kcal", sa.Integer(), nullable=False, server_default="200"),
    )
    op.add_column(
        "user_profile",
        sa.Column("tef_rate", sa.Numeric(4, 3), nullable=False, server_default="0.100"),
    )
    op.alter_column("user_profile", "neat_kcal", server_default=None)
    op.alter_column("user_profile", "tef_rate", server_default=None)


def downgrade() -> None:
    op.drop_column("user_profile", "tef_rate")
    op.drop_column("user_profile", "neat_kcal")

    op.add_column("user_profile", sa.Column("target_carbs_g", sa.Numeric(6, 2), nullable=False))
    op.add_column("user_profile", sa.Column("target_fat_g", sa.Numeric(6, 2), nullable=False))
    op.add_column("user_profile", sa.Column("target_protein_g", sa.Numeric(6, 2), nullable=False))
    op.add_column("user_profile", sa.Column("target_kcal", sa.Integer(), nullable=False))
    op.add_column(
        "user_profile",
        sa.Column("activity_factor", sa.Numeric(4, 3), nullable=False, server_default="1.375"),
    )

    op.create_table(
        "walk_sessions",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("walked_at", sa.DateTime(), nullable=False),
        sa.Column("discovery_note", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_walk_sessions_walked_at", "walk_sessions", ["walked_at"])
