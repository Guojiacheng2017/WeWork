"""Add runtime profile links introduced after the wework core schema."""

from alembic import op
import sqlalchemy as sa


revision = "0002_runtime_profile_links"
down_revision = "0002_pi_runtime_profiles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    specs = (
        ("wework_teams", "default_runtime_profile_id", None, "fk_wework_teams_default_runtime_profile"),
        ("wework_employees", "default_runtime_profile_id", "ix_wework_employees_default_runtime_profile_id", "fk_wework_employees_default_runtime_profile"),
        ("wework_works", "runtime_profile_id", "ix_wework_works_runtime_profile_id", "fk_wework_works_runtime_profile"),
    )
    for table, column, index_name, fk_name in specs:
        inspector = sa.inspect(bind)
        column_names = {item["name"] for item in inspector.get_columns(table)}
        index_names = {item["name"] for item in inspector.get_indexes(table)}
        foreign_keys = inspector.get_foreign_keys(table)
        fk_names = {item["name"] for item in foreign_keys}
        fk_columns = {tuple(item["constrained_columns"]) for item in foreign_keys}
        with op.batch_alter_table(table) as batch_op:
            if column not in column_names:
                batch_op.add_column(sa.Column(column, sa.String(length=36), nullable=True))
            if index_name and index_name not in index_names:
                batch_op.create_index(index_name, [column])
            if fk_name not in fk_names and (column,) not in fk_columns:
                batch_op.create_foreign_key(
                    fk_name, "wework_runtime_profiles", [column], ["id"], ondelete="SET NULL",
                )


def downgrade() -> None:
    with op.batch_alter_table("wework_works") as batch_op:
        batch_op.drop_constraint("fk_wework_works_runtime_profile", type_="foreignkey")
        batch_op.drop_index("ix_wework_works_runtime_profile_id")
        batch_op.drop_column("runtime_profile_id")

    with op.batch_alter_table("wework_employees") as batch_op:
        batch_op.drop_constraint("fk_wework_employees_default_runtime_profile", type_="foreignkey")
        batch_op.drop_index("ix_wework_employees_default_runtime_profile_id")
        batch_op.drop_column("default_runtime_profile_id")

    with op.batch_alter_table("wework_teams") as batch_op:
        batch_op.drop_constraint("fk_wework_teams_default_runtime_profile", type_="foreignkey")
        batch_op.drop_column("default_runtime_profile_id")
