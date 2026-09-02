"""Persist end-side workspace assignment metadata.

Revision ID: 0005_workspace_assignments
Revises: 0004_team_messages
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_workspace_assignments"
down_revision = "0004_team_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    for table in ("wework_teams", "wework_employees"):
        columns = {column["name"] for column in sa.inspect(bind).get_columns(table)}
        if "workspace_assignment" not in columns:
            op.add_column(table, sa.Column("workspace_assignment", sa.JSON(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    for table in ("wework_employees", "wework_teams"):
        columns = {column["name"] for column in sa.inspect(bind).get_columns(table)}
        if "workspace_assignment" in columns:
            op.drop_column(table, "workspace_assignment")
