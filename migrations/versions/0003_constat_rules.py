"""digital constat, contracts, subscription photos, fraud rules config, consortium

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-24

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contracts",
        sa.Column("policy_id", sa.String(), primary_key=True),
        sa.Column("plate", sa.String(), nullable=False),
        sa.Column("holder_name", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=False),
        sa.Column("cin", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("make_model", sa.String(), nullable=False),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("city", sa.String(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("insurer", sa.String(), nullable=False),
    )
    op.create_index("ix_contracts_plate", "contracts", ["plate"])

    op.create_table(
        "subscription_photos",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("plate", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("path", sa.String(), nullable=False),
        sa.Column("taken_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_subscription_photos_plate", "subscription_photos", ["plate"])

    op.create_table(
        "constats",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("token", sa.String(), nullable=False, unique=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("accident_at", sa.DateTime(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("city", sa.String(), nullable=False),
        sa.Column("party_a", sa.JSON(), nullable=False),
        sa.Column("party_b", sa.JSON(), nullable=True),
        sa.Column("witnesses", sa.JSON(), nullable=False),
        sa.Column("transcript_a", sa.Text(), nullable=True),
        sa.Column("signature_a", sa.JSON(), nullable=True),
        sa.Column("signature_b", sa.JSON(), nullable=True),
        sa.Column("analysis", sa.JSON(), nullable=False),
        sa.Column("seal", sa.String(), nullable=True),
        sa.Column("dossier_id", sa.String(), sa.ForeignKey("dossiers.id"), nullable=True),
    )
    op.create_index("ix_constats_token", "constats", ["token"], unique=True)
    op.create_index("ix_constats_status", "constats", ["status"])

    op.create_table(
        "constat_files",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("constat_id", sa.String(), sa.ForeignKey("constats.id"), nullable=False),
        sa.Column("party", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("path", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("analysis", sa.JSON(), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_constat_files_constat_id", "constat_files", ["constat_id"])

    op.create_table(
        "rule_configs",
        sa.Column("rule_id", sa.String(), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("weight", sa.Float(), nullable=False),
    )

    op.create_table(
        "consortium_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("identifier_hash", sa.String(), nullable=False),
        sa.Column("company", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("reported_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_consortium_entries_identifier_hash", "consortium_entries", ["identifier_hash"])


def downgrade() -> None:
    for table in ("consortium_entries", "rule_configs", "constat_files", "constats", "subscription_photos", "contracts"):
        op.drop_table(table)
