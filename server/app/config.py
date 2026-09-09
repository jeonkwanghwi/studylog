from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://studylog:studylog@localhost:5432/studylog"
    jwt_secret: str = "dev-secret-change-me"
    jwt_days: int = 90
    apple_bundle_id: str = "com.studylog.app"
    google_client_id: str = ""

    # 스토리지
    s3_bucket: str = "studylog-photos"
    aws_region: str = "ap-northeast-2"
    image_max_edge: int = 1280
    image_jpeg_quality: int = 80

    # 판정
    judge_provider: str = "claude"
    judge_model: str = "claude-haiku-4-5"
    judge_fail_confidence: float = 0.7
    judge_timeout_seconds: float = 10.0
    anthropic_api_key: str = ""

    # 세션
    session_max_minutes: int = 240
    session_warn_minutes: int = 210

    # 결제
    revenuecat_webhook_secret: str = "dev-webhook-secret"
    restore_window_hours: int = 24
    tickets_for_defense: int = 1
    tickets_for_restore: int = 2

    # 알림
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"


settings = Settings()
