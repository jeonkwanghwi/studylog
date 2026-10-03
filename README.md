# 스터디로그

공부를 사진으로 인증하고 AI가 판정하는 앱. **돈을 먼저 걸고, 목표를 채운 날마다
하루치를 앱 내 크레딧으로 돌려받는다.** 손실회피가 동력이다.

> **상태: 중단 (2026-10-03).** 코드는 완성됐고 실기기에서 돌았다. 결제 직전에
> 접었다 — 자세한 사정은 아래 "왜 멈췄나".
>
> **다시 시작하려면 [재시작 절차](#재시작-절차)부터 읽어라.** 인프라와 외부
> 계정이 전부 지워져 있어서 코드만으로는 안 돈다.

---

## 무엇이 만들어져 있나

| | |
|---|---|
| **서버** | Python 3.12 / FastAPI / SQLAlchemy / Alembic. 엔드포인트 22개, 테스트 219개 |
| **앱** | Expo SDK 57 / React Native / Expo Router / TanStack Query. 테스트 228개 |
| **판정** | OpenAI `gpt-5-mini` 비전. 프롬프트 인젝션 방어 포함 |
| **인증** | 애플·카카오 소셜 로그인 (구글은 코드만 있고 클라이언트 ID 미발급) |
| **결제** | RevenueCat + 인앱결제 설계 완료, **실제 연동은 안 됨** |
| **약관** | 본문 작성 완료. 웹페이지는 `content.ts` 에서 생성한다 |

실기기에서 확인된 것: 카카오 로그인, 사진 촬영·업로드·AI 판정·이의제기, 홈/기록/
피드/설정 화면, 회원 탈퇴.

## 왜 멈췄나

제품이나 기술 문제가 아니었다. **계정 문제로 두 주를 썼다.**

- Apple Developer 등록이 나흘간 이유 없이 거절됐다 (원인: 빈 Apple ID —
  [자세히](docs/QUESTIONS.md))
- 그 사이 친구 계정으로 우회했다가, 세금·판매자 책임이 친구에게 간다는 걸 알고 되돌림
- 본인 계정으로 풀린 뒤 유료 앱 계약을 넣었으나 세금 양식 단계에서 중단

결제를 한 줄도 검증하지 못한 채로 멈췄다.

## 지금 남아 있는 것 / 없는 것

**지워짐** — AWS 전부(EC2·RDS·스냅샷·S3·고정IP·VPC·IAM·키페어),
Google Cloud 프로젝트, OpenAI 키, 서버의 모든 데이터.

**남아 있음** — 이 저장소, 도메인 `studylog.co.kr`(2027-09-24 만료, 자동연장 없음),
Apple Developer 멤버십 2개(2027년 9월 만료), 카카오 개발자 앱, EAS 프로젝트.

## 재시작 절차

코드는 그대로지만 **인프라와 키가 전부 없다.** 순서대로:

```bash
# 0. 의존성
cd app-client && npm ci
cd ../server && python3 -m venv .venv && .venv/bin/pip install -e . && .venv/bin/python -m pytest
```

1. **AWS 재구축** — `server/deploy/aws-resources.md` 에 당시 구성이 남아 있다.
   `restore-infra.sh` 는 쓸 수 없다(스냅샷을 지웠다). VPC·서브넷·보안그룹·EC2·
   RDS·S3·IAM 을 처음부터 만들어야 한다. **studylog 전용 VPC 를 따로 파라** —
   같은 계정에 다른 프로젝트가 있을 때 경계가 분명해서 지울 때 값을 했다.
2. **키 재발급** — OpenAI, 카카오 REST API(앱이 남아 있으면 그대로), JWT 시크릿.
   `server/.env.example` 이 필요한 항목 목록이다.
3. **도메인 연결** — 가비아 DNS 에 A 레코드 2개(`@`, `api`) → 새 고정 IP.
   nginx + certbot 은 `aws-resources.md` 의 HTTPS 절을 따라간다.
4. **약관 웹페이지** — `npm run build:legal && server/deploy/publish-web.sh`
5. **남은 블로커** — [docs/QUESTIONS.md](docs/QUESTIONS.md) 참고. 요약하면:
   - 문의처 이메일 (`src/legal/content.ts` 의 `CONTACT` 한 줄)
   - 유료 앱 계약 활성화 (세금 양식 2개가 막고 있었다)
   - 가격 티어 확인 — 21,000 / 42,000원이 한국에 있는지
   - 소셜 로그인 공식 심볼 이미지

## 재시작 전에 알아둘 것

**애플 수수료와 크레딧 경제학.** 크레딧은 현금이 아니라서 지급해도 통장에서 돈이
나가지 않는다. 실제 비용은 애플 수수료 15%, AI 판정(사진 1장 ~1원), 서버 고정비뿐이다.
완주 보너스는 적자가 아니라 **그 유저의 LTV 상한**을 만든다. 수익은 "완벽하지 않은
사람이 다수"라는 가정에서 나온다 — 광고로 메울 필요도, 메울 수도 없다(계산상 7%).

**오프라인 캐싱은 일부러 안 했다.** 크레딧은 돈이고, 오래된 잔액을 보여주는 것이
"모르겠다"보다 나쁘다. 조회 실패는 캐시로 덮지 말고 실패로 보여준다 —
`LoadFailed` 의 주석이 그 원칙을 적어뒀다.

**모킹한 것은 테스트되지 않는다.** 이 프로젝트에서 세 번 데였다. 로그인 화면이
통째로 깨졌는데 `src/auth/social` 을 모킹해서 못 잡았고, 사진 업로드가 안 됐는데
`fetch` 를 모킹해서 못 잡았다(업로드는 XHR 을 쓴다). 카메라 모킹이 ref 를 안
넘겨서 빈 uri 크래시도 놓쳤다.

**Expo 는 fetch 를 대체하지만 XMLHttpRequest 는 건드리지 않는다.** 멀티파트
업로드가 안 되면 이걸 의심해라 (`src/api/client.ts` 의 `sendForm`).

## 문서

| | |
|---|---|
| [docs/QUESTIONS.md](docs/QUESTIONS.md) | **가장 중요.** 미결 과제와 그동안의 결정·사고 기록 |
| [docs/01-service-design.md](docs/01-service-design.md) | 서비스 설계 |
| [구현 스펙](docs/superpowers/specs/2026-09-09-studylog-v1-design.md) | 스키마·흐름·판정 정책 |
| [server/deploy/aws-resources.md](server/deploy/aws-resources.md) | 당시 인프라 구성과 HTTPS 절차 |
| [server/deploy/runbook.md](server/deploy/runbook.md) | 배포 순서 |
