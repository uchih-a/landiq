"""Remove deprecated model feature columns."""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001_initial_schema" 

def upgrade():
    op.drop_column("predictions", "dist_to_water_body_km")
    op.drop_column("predictions", "location_score")
    op.drop_column("predictions", "log_dist_to_nairobi")
    op.alter_column("predictions", "infrastructure_score", nullable=True)

def downgrade():
    op.add_column("predictions", sa.Column("dist_to_water_body_km", sa.Float))
    op.add_column("predictions", sa.Column("location_score", sa.Float))
    op.add_column("predictions", sa.Column("log_dist_to_nairobi", sa.Float))
    op.alter_column("predictions", "infrastructure_score", nullable=False)
