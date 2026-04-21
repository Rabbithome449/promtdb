"""baseline schema drift migration

Revision ID: 20260422_0001
Revises:
Create Date: 2026-04-22 00:50
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260422_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_names(table_name: str) -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if table_name not in inspector.get_table_names():
        return set()
    return {col["name"] for col in inspector.get_columns(table_name)}


def upgrade() -> None:
    phrase_cols = _column_names("phrase")
    if "required_lora" not in phrase_cols:
        op.add_column("phrase", sa.Column("required_lora", sa.String(), nullable=True))

    char_cols = _column_names("characterpreset")
    if "version_family" not in char_cols:
        op.add_column("characterpreset", sa.Column("version_family", sa.String(), server_default="", nullable=False))
    if "version" not in char_cols:
        op.add_column("characterpreset", sa.Column("version", sa.Integer(), server_default="1", nullable=False))
    if "required_sdxl_base_model" not in char_cols:
        op.add_column("characterpreset", sa.Column("required_sdxl_base_model", sa.String(), nullable=True))
    if "recommended_sdxl_base_model" not in char_cols:
        op.add_column("characterpreset", sa.Column("recommended_sdxl_base_model", sa.String(), nullable=True))


def downgrade() -> None:
    pass

