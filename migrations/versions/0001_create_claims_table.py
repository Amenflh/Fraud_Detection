"""create claims table

Revision ID: 0001
Revises:
Create Date: 2026-10-21

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "claims",
        sa.Column("claim_id", sa.String(), primary_key=True),
        sa.Column("policy_id", sa.String(), nullable=False),
        sa.Column("final_verdict", sa.String(), nullable=False),
        sa.Column("risk_score", sa.Float(), nullable=False),
        sa.Column("verdict_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_claims_policy_id", "claims", ["policy_id"])
    op.create_index("ix_claims_final_verdict", "claims", ["final_verdict"])


def downgrade() -> None:
    op.drop_index("ix_claims_final_verdict", table_name="claims")
    op.drop_index("ix_claims_policy_id", table_name="claims")
    op.drop_table("claims")
