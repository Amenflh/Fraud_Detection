"""claim workflow: actors, dossiers, events, messages, documents

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "actors",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("city", sa.String(), nullable=False),
        sa.Column("specialties", sa.JSON(), nullable=False),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("rating", sa.Float(), nullable=False),
    )
    op.create_index("ix_actors_role", "actors", ["role"])

    op.create_table(
        "dossiers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("claim_json", sa.JSON(), nullable=False),
        sa.Column("insured_json", sa.JSON(), nullable=False),
        sa.Column("vehicle_json", sa.JSON(), nullable=False),
        sa.Column("city", sa.String(), nullable=False),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("agent_id", sa.String(), sa.ForeignKey("actors.id"), nullable=True),
        sa.Column("expert_id", sa.String(), sa.ForeignKey("actors.id"), nullable=True),
        sa.Column("garage_id", sa.String(), sa.ForeignKey("actors.id"), nullable=True),
        sa.Column("quote_amount", sa.Float(), nullable=True),
        sa.Column("verdict_json", sa.JSON(), nullable=True),
        sa.Column("ai_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_dossiers_status", "dossiers", ["status"])
    op.create_index("ix_dossiers_city", "dossiers", ["city"])

    op.create_table(
        "dossier_events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("dossier_id", sa.String(), sa.ForeignKey("dossiers.id"), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_dossier_events_dossier_id", "dossier_events", ["dossier_id"])

    op.create_table(
        "messages",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("dossier_id", sa.String(), sa.ForeignKey("dossiers.id"), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("author", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
    )
    op.create_index("ix_messages_dossier_id", "messages", ["dossier_id"])

    op.create_table(
        "documents",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("dossier_id", sa.String(), sa.ForeignKey("dossiers.id"), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("path", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("image_hash", sa.String(), nullable=True),
        sa.Column("analysis", sa.JSON(), nullable=False),
    )
    op.create_index("ix_documents_dossier_id", "documents", ["dossier_id"])
    op.create_index("ix_documents_image_hash", "documents", ["image_hash"])


def downgrade() -> None:
    for table in ("documents", "messages", "dossier_events", "dossiers", "actors"):
        op.drop_table(table)
