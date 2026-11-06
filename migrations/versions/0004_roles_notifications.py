"""role-based ownership and notification outbox

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-25

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("actors", sa.Column("email", sa.String(), nullable=True))
    op.add_column("constats", sa.Column("owner_email", sa.String(), nullable=True))
    op.create_index("ix_constats_owner_email", "constats", ["owner_email"])

    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("dossier_id", sa.String(), sa.ForeignKey("dossiers.id"), nullable=True),
        sa.Column("channel", sa.String(), nullable=False),
        sa.Column("recipient", sa.String(), nullable=False),
        sa.Column("recipient_role", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("html", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("dedupe_key", sa.String(), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_notifications_dossier_id", "notifications", ["dossier_id"])
    op.create_index("ix_notifications_status", "notifications", ["status"])


def downgrade() -> None:
    op.drop_table("notifications")
    op.drop_index("ix_constats_owner_email", table_name="constats")
    op.drop_column("constats", "owner_email")
    op.drop_column("actors", "email")
