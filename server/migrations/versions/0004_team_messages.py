"""add persistent team chat messages

Revision ID: 0004_team_messages
Revises: 0003_runtime_run_links
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_team_messages"
down_revision = "0003_runtime_run_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("wework_teams")}
    if "team_messages" not in columns:
        op.add_column("wework_teams", sa.Column("team_messages", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("wework_teams")}
    if "team_messages" in columns:
        op.drop_column("wework_teams", "team_messages")
