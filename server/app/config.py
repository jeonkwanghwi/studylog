from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_PLACEHOLDER = "dev-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://studylog:studylog@localhost:5432/studylog"
    jwt_secret: str
    jwt_days: int = 90
    apple_bundle_id: str = "com.studylog.app"
    google_client_id: str = ""
    google_ios_client_id: str = ""
    google_android_client_id: str = ""
    kakao_rest_api_key: str = ""   # 카카오 OIDC 의 audience

    # 스토리지
    s3_bucket: str = "studylog-photos"
    aws_region: str = "ap-northeast-2"
    image_max_edge: int = 1280
    image_jpeg_quality: int = 80
    photo_url_expire_seconds: int = 3600

    # 판정
    judge_provider: str = "claude"
    judge_model: str = "claude-haiku-4-5"
    judge_fail_confidence: float = 0.7
    judge_timeout_seconds: float = 10.0
    judge_retry_attempts: int = 3
    judge_retry_backoff_seconds: float = 0.5
    anthropic_api_key: str = ""
    openai_api_key: str = ""

    # 세션
    session_max_minutes: int = 240
    session_warn_minutes: int = 210

    # 결제
    revenuecat_webhook_secret: str = "dev-webhook-secret"
    restore_window_hours: int = 24
    restore_credit_cost: int = 2000
    max_entry_amount: int = 50000
    first_challenge_max_entry: int = 30000

    # 알림
    expo_push_url: str = "https://exp.host/--/api/v2/push/send"

    @model_validator(mode="after")
    def _require_real_jwt_secret(self) -> "Settings":
        if not self.jwt_secret or self.jwt_secret == _DEV_PLACEHOLDER:
            raise ValueError(
                "JWT_SECRET이 비어있거나 개발용 기본값입니다. "
                ".env에 실제 시크릿을 설정하세요."
            )
        return self


settings = Settings()
