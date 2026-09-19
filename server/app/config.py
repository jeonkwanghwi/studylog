from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_PLACEHOLDER = "dev-secret-change-me"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://studylog:studylog@localhost:5432/studylog"
    jwt_secret: str
    jwt_days: int = 90
    apple_bundle_id: str = "com.kwanghwi.studylog"
    google_client_id: str = ""
    google_ios_client_id: str = ""
    google_android_client_id: str = ""
    kakao_rest_api_key: str = ""   # 카카오 OIDC 의 audience
    # 카카오 콜백이 되돌려보낼 앱 스킴. app.json 의 expo.scheme 과 같아야 한다.
    app_scheme: str = "studylog"

    # 스토리지
    s3_bucket: str = "studylog-photos"
    aws_region: str = "ap-northeast-2"
    image_max_edge: int = 1280
    image_jpeg_quality: int = 80
    photo_url_expire_seconds: int = 3600

    # 판정
    judge_provider: str = "openai"
    judge_model: str = "gpt-5-mini"
    judge_fail_confidence: float = 0.7
    judge_timeout_seconds: float = 10.0
    judge_retry_attempts: int = 3
    judge_retry_backoff_seconds: float = 0.5
    # OpenAI GPT-5 계열 전용. 비워두면 보내지 않는다(다른 모델은 이 인자를
    # 모른다). "minimal" 이면 추론 토큰을 쓰지 않는다 — 장면 인식에 긴
    # 추론은 필요 없고, 추론이 예산을 먹으면 응답이 통째로 비어서 온다.
    judge_reasoning_effort: str = "low"
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
