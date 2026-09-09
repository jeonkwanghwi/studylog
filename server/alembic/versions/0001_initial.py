"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-09-09

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("provider_sub", sa.String(length=255), nullable=False),
        sa.Column("nickname", sa.String(length=32), nullable=False),
        sa.Column("daily_goal_minutes", sa.Integer(), nullable=False),
        sa.Column("pending_goal_minutes", sa.Integer(), nullable=True),
        sa.Column("streak_count", sa.Integer(), nullable=False),
        sa.Column("credit_balance", sa.Integer(), nullable=False),
        sa.Column("expo_push_token", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("provider", "provider_sub", name="uq_users_provider_provider_sub"),
    )

    op.create_table(
        "groups",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("invite_code", sa.String(length=6), nullable=False),
        sa.Column("owner_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_groups_invite_code", "groups", ["invite_code"], unique=True)

    op.create_table(
        "memberships",
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("group_id", sa.String(length=36), sa.ForeignKey("groups.id"), primary_key=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "photos",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("s3_key", sa.String(length=255), nullable=False),
        sa.Column("phash", sa.String(length=32), nullable=True),
        sa.Column("exif_taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
    )
    op.create_index("ix_photos_user_id", "photos", ["user_id"])

    op.create_table(
        "study_sessions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("start_photo_id", sa.String(length=36), sa.ForeignKey("photos.id"), nullable=False),
        sa.Column("end_photo_id", sa.String(length=36), sa.ForeignKey("photos.id"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("counted_minutes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("warned_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_study_sessions_user_id", "study_sessions", ["user_id"])

    op.create_table(
        "verdicts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("photo_id", sa.String(length=36), sa.ForeignKey("photos.id"), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("appeal_text", sa.Text(), nullable=True),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("decision", sa.String(length=8), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("raw_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("photo_id", "attempt", name="uq_verdicts_photo_id_attempt"),
    )
    op.create_index("ix_verdicts_photo_id", "verdicts", ["photo_id"])

    op.create_table(
        "challenges",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("product_id", sa.String(length=32), nullable=False),
        sa.Column("entry_amount", sa.Integer(), nullable=False),
        sa.Column("daily_payback", sa.Integer(), nullable=False),
        sa.Column("completion_bonus", sa.Integer(), nullable=False),
        sa.Column("total_days", sa.Integer(), nullable=False),
        sa.Column("started_on", sa.Date(), nullable=False),
        sa.Column("ends_on", sa.Date(), nullable=False),
        sa.Column("paid_with", sa.String(length=8), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_challenges_user_id", "challenges", ["user_id"])

    op.create_table(
        "daily_records",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("total_minutes", sa.Integer(), nullable=False),
        sa.Column("goal_minutes", sa.Integer(), nullable=False),
        sa.Column("result", sa.String(length=8), nullable=False),
        sa.Column("challenge_id", sa.String(length=36), sa.ForeignKey("challenges.id"), nullable=True),
        sa.Column("payback_amount", sa.Integer(), nullable=False),
        sa.Column("streak_snapshot", sa.Integer(), nullable=False),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "date", name="uq_daily_records_user_id_date"),
    )
    op.create_index("ix_daily_records_user_id", "daily_records", ["user_id"])

    op.create_table(
        "credit_ledger",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=16), nullable=False),
        sa.Column("ref_id", sa.String(length=36), nullable=True),
        sa.Column("balance_after", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_credit_ledger_user_id", "credit_ledger", ["user_id"])

    op.create_table(
        "purchases",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("revenuecat_event_id", sa.String(length=64), nullable=False, unique=True),
        sa.Column("product_id", sa.String(length=32), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("challenge_id", sa.String(length=36), sa.ForeignKey("challenges.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_purchases_user_id", "purchases", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_purchases_user_id", table_name="purchases")
    op.drop_table("purchases")
    op.drop_index("ix_credit_ledger_user_id", table_name="credit_ledger")
    op.drop_table("credit_ledger")
    op.drop_index("ix_daily_records_user_id", table_name="daily_records")
    op.drop_table("daily_records")
    op.drop_index("ix_challenges_user_id", table_name="challenges")
    op.drop_table("challenges")
    op.drop_index("ix_verdicts_photo_id", table_name="verdicts")
    op.drop_table("verdicts")
    op.drop_index("ix_study_sessions_user_id", table_name="study_sessions")
    op.drop_table("study_sessions")
    op.drop_index("ix_photos_user_id", table_name="photos")
    op.drop_table("photos")
    op.drop_table("memberships")
    op.drop_index("ix_groups_invite_code", table_name="groups")
    op.drop_table("groups")
    op.drop_table("users")
