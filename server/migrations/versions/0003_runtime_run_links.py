"""Add runtime profile and session links to runtime runs."""

from alembic import op
import sqlalchemy as sa


revision = "0003_runtime_run_links"
down_revision = "0002_runtime_profile_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    table = "wework_runtime_runs"
    specs = (
        ("runtime_profile_id", "ix_wework_runtime_runs_runtime_profile_id", "fk_wework_runtime_runs_runtime_profile", "wework_runtime_profiles"),
        ("runtime_session_id", "ix_wework_runtime_runs_runtime_session_id", "fk_wework_runtime_runs_runtime_session", "wework_runtime_sessions"),
    )
    for column, index_name, fk_name, target in specs:
        inspector = sa.inspect(bind)
        column_names = {item["name"] for item in inspector.get_columns(table)}
        index_names = {item["name"] for item in inspector.get_indexes(table)}
        foreign_keys = inspector.get_foreign_keys(table)
        fk_names = {item["name"] for item in foreign_keys}
        fk_columns = {tuple(item["constrained_columns"]) for item in foreign_keys}
        with op.batch_alter_table(table) as batch_op:
            if column not in column_names:
                batch_op.add_column(sa.Column(column, sa.String(length=36), nullable=True))
            if index_name not in index_names:
                batch_op.create_index(index_name, [column])
            if fk_name not in fk_names and (column,) not in fk_columns:
                batch_op.create_foreign_key(fk_name, target, [column], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("wework_runtime_runs") as batch_op:
        batch_op.drop_constraint("fk_wework_runtime_runs_runtime_session", type_="foreignkey")
        batch_op.drop_constraint("fk_wework_runtime_runs_runtime_profile", type_="foreignkey")
        batch_op.drop_index("ix_wework_runtime_runs_runtime_session_id")
        batch_op.drop_index("ix_wework_runtime_runs_runtime_profile_id")
        batch_op.drop_column("runtime_session_id")
        batch_op.drop_column("runtime_profile_id")
