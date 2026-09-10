# StudyLog 배포 런북

1. **Lightsail** `t4g.small` / Ubuntu 24.04. nginx로 443 → 127.0.0.1:8000 리버스 프록시, certbot으로 인증서
2. **RDS** `db.t4g.micro`, gp3 20GB, 자동 백업 7일, 퍼블릭 액세스 끔, 보안그룹은 Lightsail만 허용
3. **S3** 버킷 `studylog-photos`. 퍼블릭 액세스 전면 차단 — 사진은 presigned URL로만 나간다. 인스턴스 역할에 `s3:PutObject`, `s3:GetObject`만 부여
4. **시크릿** `/srv/studylog/server/.env`, 소유자 `studylog`, 퍼미션 `600`. 채울 키: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `APPLE_BUNDLE_ID`, `GOOGLE_CLIENT_ID`, `S3_BUCKET`
5. **배포** `git pull` → `pip install -e .` → **`alembic check`** → `alembic upgrade head` → `systemctl restart studylog`

   > `alembic check`를 건너뛰지 말 것. `0001_initial.py`는 손으로 작성됐고 실제
   > Postgres 상대로 한 번도 돌아본 적이 없다(개발 환경에 DB가 없어 `--sql` 렌더링으로만
   > 검증했다). 첫 배포가 이 마이그레이션의 첫 실전이므로, 모델과 어긋난 곳이 있으면
   > 여기서 잡아야 한다.
6. **cron 등록** `crontab -u studylog server/deploy/crontab`
7. **RevenueCat** 대시보드에서 웹훅 URL을 `https://<도메인>/webhooks/revenuecat`으로,
   Authorization 헤더를 `Bearer <REVENUECAT_WEBHOOK_SECRET>`로 설정한다.

   상품 ID는 **앱스토어·구글플레이·RevenueCat 세 곳 모두에서 아래와 정확히 같아야 한다.**
   하나라도 다르면 결제는 정상으로 끝나는데 웹훅이 상품을 못 찾아 챌린지가 시작되지
   않는다 — 돈은 걷히고 유저는 아무것도 못 받는다. `app/domain.py`의
   `CHALLENGE_PRODUCTS` 키가 유일한 정본이며, 배포 전에 대조할 것:

   | 상품 ID | 기간 | 하루 배팅 | 가격 |
   |---|---|---|---|
   | `challenge_7d_1k` | 7일 | ₩1,000 | ₩7,000 |
   | `challenge_7d_2k` | 7일 | ₩2,000 | ₩14,000 |
   | `challenge_7d_3k` | 7일 | ₩3,000 | ₩21,000 |
   | `challenge_14d_1k` | 14일 | ₩1,000 | ₩14,000 |
   | `challenge_14d_2k` | 14일 | ₩2,000 | ₩28,000 |
   | `challenge_14d_3k` | 14일 | ₩3,000 | ₩42,000 |
   | `challenge_30d_1k` | 30일 | ₩1,000 | ₩30,000 |

   대조 명령: `python -c "from app.domain import CHALLENGE_PRODUCTS as P;
   [print(k, v.price) for k,v in sorted(P.items())]"`

   가격이 스토어 티어에 없으면 **가격을 억지로 맞추지 말고** 하루 배팅액을 조정해서
   참가비가 티어에 떨어지게 한 뒤, `CHALLENGE_PRODUCTS`를 먼저 고치고 배포한다.
8. **점검** 배포 후 `curl https://<도메인>/health`가 `{"status":"ok"}`를 주는지,
   `python -m app.cli sweep`이 에러 없이 끝나는지 확인
9. **첫 정산 전 확인** 서비스 시작 후 첫 04:00이 오기 전에 `python -m app.cli settle`을
   스테이징에서 한 번 돌려본다. 정산은 크레딧을 실제로 지급하므로 되돌리기가 번거롭다
