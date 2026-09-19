"""users.goal_initialized

온보딩의 첫 목표 설정만 즉시 반영하기 위한 플래그.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-20

"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 기존 행은 이미 온보딩을 통과한 유저다 — 그들에게는 다음 변경부터
    # 기존 규칙(다음 04:00 이후 반영)이 그대로 적용돼야 한다.
    op.add_column(
        "users",
        sa.Column("goal_initialized", sa.Boolean(), nullable=False,
                  server_default=sa.true()),
    )
    # 앞으로 만들어지는 행은 False 로 시작한다. 기본값을 테이블에 남겨두면
    # 신규 유저까지 True 가 되어 첫 설정이 또 미뤄진다.
    op.alter_column("users", "goal_initialized", server_default=sa.false())


def downgrade() -> None:
    op.drop_column("users", "goal_initialized")
