"""Pi runtime profiles and portable sessions."""

from alembic import op
import sqlalchemy as sa

revision = "0002_pi_runtime_profiles"
down_revision = "0001_wework_core"
branch_labels = None
depends_on = None


def has_table(name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(name)


def columns(name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(name)}


def upgrade() -> None:
    if not has_table("wework_runtime_profiles"):
        op.create_table(
            "wework_runtime_profiles",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False, unique=True),
            sa.Column("adapter", sa.String(50), nullable=False, index=True),
            sa.Column("model_config", sa.JSON(), nullable=False),
            sa.Column("system_prompt", sa.Text(), nullable=False, server_default=""),
            sa.Column("thinking_level", sa.String(20), nullable=False, server_default="off"),
            sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )

    additions = {
        "wework_teams": sa.Column("default_runtime_profile_id", sa.String(36), nullable=True),
        "wework_employees": sa.Column("default_runtime_profile_id", sa.String(36), nullable=True),
        "wework_works": sa.Column("runtime_profile_id", sa.String(36), nullable=True),
        "wework_runtime_runs": sa.Column("runtime_profile_id", sa.String(36), nullable=True),
    }
    for table, column in additions.items():
        if column.name not in columns(table):
            with op.batch_alter_table(table) as batch:
                batch.add_column(column)

    if not has_table("wework_runtime_sessions"):
        op.create_table(
            "wework_runtime_sessions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("employee_id", sa.String(36), sa.ForeignKey("wework_employees.id", ondelete="CASCADE"), nullable=False),
            sa.Column("runtime_profile_id", sa.String(36), sa.ForeignKey("wework_runtime_profiles.id", ondelete="CASCADE"), nullable=False),
            sa.Column("native_session_id", sa.String(200), nullable=True),
            sa.Column("messages", sa.JSON(), nullable=False),
            sa.Column("usage", sa.JSON(), nullable=False),
            sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.UniqueConstraint("employee_id", "runtime_profile_id", name="uq_runtime_employee_profile"),
        )

    if "runtime_session_id" not in columns("wework_runtime_runs"):
        with op.batch_alter_table("wework_runtime_runs") as batch:
            batch.add_column(sa.Column("runtime_session_id", sa.String(36), nullable=True))


def downgrade() -> None:
    if "runtime_session_id" in columns("wework_runtime_runs"):
        with op.batch_alter_table("wework_runtime_runs") as batch:
            batch.drop_column("runtime_session_id")
    if has_table("wework_runtime_sessions"):
        op.drop_table("wework_runtime_sessions")
    for table, name in (
        ("wework_runtime_runs", "runtime_profile_id"),
        ("wework_works", "runtime_profile_id"),
        ("wework_employees", "default_runtime_profile_id"),
        ("wework_teams", "default_runtime_profile_id"),
    ):
        if name in columns(table):
            with op.batch_alter_table(table) as batch:
                batch.drop_column(name)
    if has_table("wework_runtime_profiles"):
        op.drop_table("wework_runtime_profiles")
