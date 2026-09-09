# StudyLog v1 구현 스펙

- **상태**: 브레인스토밍 2부 완료 / 구현 계획 미작성
- **최종 갱신**: 2026-09-09
- **선행 문서**: [01-service-design.md](../../01-service-design.md) — 1부에서 확정한 제품 뼈대

이 문서는 1부의 뼈대 위에 2부에서 정한 것을 얹어, v1 구현에 필요한 결정을 한자리에 모은 것이다.
1부 결정과 충돌하는 부분은 §1에 명시했다.

---

## 1. 1부 결정 중 뒤집힌 것

| 1부 # | 원래 결정 | 변경 | 이유 |
|---|---|---|---|
| 6 | 미종료 세션은 4시간에서 자동 마감 | **`counted_minutes = 0`, `status = abandoned`** | 시작 샷 1장으로 4시간이 적립되면 인증 단위를 "시작+종료 2샷"으로 잡은 결정 4가 무력화된다. 4시간은 정상 세션의 상한으로만 남는다 |
| 7 | 애매한 판정은 그룹 투표로 이관 | **투표 삭제. 유저 설명 + AI 재판정 1회** | 사람 개입이 사라지고, 유저가 쓴 설명 + 원래 verdict + 재판정 결과가 그대로 eval 데이터셋이 된다(결정 17의 목적) |
| 11 | 1인 1그룹 | **다중 그룹 (피드/랭킹만 그룹별)** | streak·패스권·목표는 유저 단위로 남으므로 판정·정산·결제 파이프라인은 그룹을 전혀 모른다. 정산 배치는 그룹 수와 무관하게 유저당 하루 1행 |
| 16 | AI 판정 모델 미정 | **`claude-haiku-4-5` 확정** | §7 단위경제학 참조. 어댑터는 그대로 두고 env로 교체 가능 |

`02-open-questions.md`에서 방향을 뒤집은 것은 §8에 따로 정리했다.

---

## 2. v1 범위

**포함** — 소셜 로그인 / 목표 시간 설정 / 그룹 생성·초대코드 참여 / 시작·종료 샷 촬영 및 AI 판정 /
이의제기 재판정 / 세션 합산 / 04:00 정산 / streak / 그룹 피드(사진 공개) / IAP 패스권 구매·자동 차감·streak 복구 / 푸시 알림 4종

**제외** — 그룹 투표, 랭킹(순위표), 친구 인증 알림, pHash·EXIF 기반 자동 차단,
deferred deep link, 웹, 다국어·다중 타임존

**출시 플랫폼** — iOS + Android **동시**. 친구 그룹이 단위인 앱은 한 명이 못 들어오면
그 그룹이 통째로 안 굴러간다. RN이라 코드는 하나고 추가 비용은 심사 2회뿐이다.

---

## 3. 데이터 모델

`votes` 삭제, `memberships` 신설, `users.group_id` 제거.

### users
| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | uuid PK | |
| `provider` | text | `apple` \| `google` |
| `provider_sub` | text | 소셜 계정 고유 ID. `(provider, provider_sub)` unique |
| `nickname` | text | |
| `daily_goal_minutes` | int | 오늘 적용 중인 개인별 목표 (결정 9) |
| `pending_goal_minutes` | int, null | 유저가 바꾼 값. 다음 04:00에 승격된다 (§4.7) |
| `streak_count` | int | 기본 0 |
| `pass_tickets` | int | 기본 0 |
| `created_at` | timestamptz | |

타임존 컬럼은 두지 않는다. 전원 KST 고정.

### groups / memberships
| 테이블 | 컬럼 |
|---|---|
| `groups` | `id`, `name`, `invite_code`(6자리, unique), `owner_id`, `created_at` |
| `memberships` | `user_id`, `group_id`, `joined_at`. PK `(user_id, group_id)` |

유저는 그룹 0개 상태로 앱을 쓸 수 있다.

### photos
| 컬럼 | 비고 |
|---|---|
| `id` | uuid PK |
| `user_id` | |
| `kind` | `start` \| `end` |
| `s3_key` | 리사이즈된 JPEG (§6) |
| `phash` | 저장만 한다. v1에서 차단에 쓰지 않는다 |
| `exif_taken_at` | 저장만 한다 |
| `received_at` | **서버가 요청을 받은 시각. 타이머의 기준(결정 5)** |
| `status` | `pass` \| `fail` — 최종 판정 결과 |

세션보다 사진이 먼저 생긴다(업로드 → 판정 → pass면 세션 생성). 따라서 `photos`는
세션을 참조하지 않고, `study_sessions`가 사진을 참조한다.

### study_sessions
| 컬럼 | 비고 |
|---|---|
| `id`, `user_id` | |
| `start_photo_id` / `end_photo_id` | `end_photo_id`는 nullable |
| `started_at` / `ended_at` | 각 사진의 `received_at`을 복사 |
| `counted_minutes` | `min(ended_at - started_at, 240)`. `abandoned`면 0 |
| `status` | `open` \| `closed` \| `abandoned` |

유저당 `open` 세션은 **최대 1개**. 이미 열려 있으면 새 세션 시작을 거부한다.

### verdicts
| 컬럼 | 비고 |
|---|---|
| `id`, `photo_id` | |
| `attempt` | `1`(최초) \| `2`(이의제기 재판정) |
| `appeal_text` | `attempt=2`일 때만 채워진다 |
| `provider`, `model` | 어댑터 비교용 (결정 16) |
| `decision`, `confidence`, `reason` | |
| `raw_json` | 응답 전문 (결정 17) |
| `created_at` | |

`(photo_id, attempt)` unique — 이의제기 1회 제한을 DB가 강제한다.

### daily_records
| 컬럼 | 비고 |
|---|---|
| `id`, `user_id`, `date` | `(user_id, date)` unique |
| `total_minutes`, `goal_minutes` | 정산 시점의 목표를 복사해 둔다 |
| `result` | `success` \| `passed` \| `failed` |
| `pass_tickets_used` | 0 \| 1 \| 2 |
| `streak_snapshot` | **정산 직후의 streak 값.** 복구 시 되돌릴 기준 |
| `settled_at` | |

### purchases
`id`, `user_id`, `revenuecat_event_id`(unique — 웹훅 중복 방지), `product_id`,
`tickets_granted`, `created_at`

---

## 4. 핵심 흐름

### 4.1 세션

```
POST /sessions/start   (multipart: image)
  → 리사이즈 → S3 업로드 → photos 행 생성(received_at = 요청 도착 시각)
  → AI 판정 (동기)
      pass → study_sessions 생성 (status=open, started_at=received_at)
      fail → 세션 생성 안 함. 재촬영 요구 + 이의제기 가능

POST /sessions/{id}/end   (multipart: image)
  → 동일 → AI 판정
      pass → status=closed, counted_minutes = min(ended_at - started_at, 240)
      fail → 세션은 open 유지. 재촬영 요구 + 이의제기 가능
```

하루 여러 세션 허용, 정산 시 합산 (결정 6).

**미종료 세션** — 시작 +4시간에 `abandoned`, `counted_minutes = 0`.
+3시간 30분에 경고 푸시를 보낸다(§5). 경고 없이 3시간 공부가 증발하면 이탈 사고가 된다.

### 4.2 이의제기

```
POST /photos/{id}/appeal   (body: text)
  → 해당 사진의 attempt=2 판정 실행. 프롬프트에 유저 설명을 첨부
  → pass면 원래 샷의 역할대로 처리된다 (시작 샷이면 세션 생성, 종료 샷이면 close)
  → 결과가 최종. 재이의 없음
```

**이의제기가 만들어내는 시각은 항상 유저에게 불리한 쪽으로 잡는다.**

| 재판정 대상 | 채택 시각 |
|---|---|
| 시작 샷 | `started_at` = **재판정 시각** (늦은 쪽) |
| 종료 샷 | `ended_at` = **최초 수신 시각** (이른 쪽) |

시작 샷에 최초 수신 시각을 쓰면 "시작 샷 찍고 3시간 놀다가 이의제기로 통과 → 3시간 적립"이
성립한다. 종료 샷에 재판정 시각을 쓰면 이의제기를 오래 끌수록 시간이 늘어난다.
양쪽 다 불리한 시각을 택하면 이의제기로는 1분도 벌 수 없고, 정상 유저는 손해가 없다.

이의제기 가능 시한은 **해당 하루의 04:00 정산 전까지**다. 정산된 날은 닫힌다.

### 4.3 정산 (매일 04:00 KST, 서버 cron)

전날 04:00 ~ 오늘 04:00 사이에 `closed`된 세션의 `counted_minutes` 합계로 유저당 1행을 만든다.

```
total >= goal                     → success,  streak += 1
total <  goal, pass_tickets >= 1  → passed,   pass_tickets -= 1,  streak 유지(증가 없음)
total <  goal, pass_tickets == 0  → failed,   streak = 0,  피드에 "✗ 미인증" 박제
```

모든 경우에 정산 후 `streak_count`를 `streak_snapshot`에 기록하고,
`pending_goal_minutes`가 있으면 `daily_goal_minutes`로 승격시킨다(§4.7).

### 4.4 streak 복구 (결정 14 — 핵심 매출 지점)

`failed` 레코드에 대해 **정산 후 24시간 내**, `pass_tickets >= 2`이면:

```
pass_tickets -= 2
result = passed,  pass_tickets_used = 2
streak_count = (전날 daily_record.streak_snapshot) + 1     # 전날 레코드가 없으면 1
```

**패스권은 한 종류다.** 사전 방어는 1개, 사후 복구는 2개를 쓴다. 지불의사 차이를
재화 종류가 아니라 차감 개수로 표현해서 SKU를 하나로 유지한다.

### 4.5 결제

| SKU | 가격 | 패스권 |
|---|---|---|
| `pass_3` | ₩4,900 | 3개 |
| `pass_10` | ₩14,000 | 10개 |

검증은 **RevenueCat**에 맡긴다. 웹훅 수신 → `revenuecat_event_id` 중복 확인 →
`pass_tickets` 증가 + `purchases` 행 생성. 클라이언트가 "샀다"고 말하는 것은 신뢰하지 않는다.

**환불 시 회수하지 않는다.** 이미 소비한 패스권을 되돌리면 streak가 소급 취소되는데,
그건 유저 입장에서 이해 불가능한 사고다. 반복 환불 계정은 수동 차단한다.

**심사 대응 문구** — "패스권은 유저 간 금전 이동이 없는 인앱 소모성 아이템이며,
구매액은 전액 서비스에 귀속된다." 도박성 오해를 사전에 차단한다.

### 4.6 피드

그룹별. 항목 하나 = 한 유저의 하루 = 사진들 + 누적 시간 + 결과 + streak 배지.
**사진은 그룹원에게 전부 공개된다.** pHash·EXIF 자동 차단을 v1에서 빼기로 했으므로
(§8) 부정행위를 실제로 억제하는 것은 상호 감시다.

세션이 `closed`되면 즉시 피드에 뜨고, `✗ 미인증` 박제는 04:00 정산 후에 붙는다.

**순위표는 만들지 않는다.** 목표가 개인별이라 절대 시간으로 줄 세우면 직장인이 영원히
꼴찌고(결정 9의 취지가 사라진다), 달성률·streak 기준은 목표를 낮게 잡을수록 유리해서
어뷰징된다. 경쟁은 피드의 streak 숫자 비교로 자연 발생시킨다.

### 4.7 목표 시간 변경

유저가 목표를 바꾸면 `pending_goal_minutes`에만 쓰고, **04:00 정산 배치가 그날 정산을
끝낸 뒤** `daily_goal_minutes`로 승격시킨다. 즉 **변경은 항상 다음 날부터 적용**된다.

즉시 반영하면 밤 10시에 목표를 10분으로 낮춰 무조건 `success`를 만들 수 있다.
개인별 목표(결정 9)를 도입한 이상 이 구멍은 반드시 막아야 한다. 컬럼 하나로 끝난다.

---

## 5. 알림

| 시점 | 대상 | 내용 |
|---|---|---|
| 세션 시작 +3h30m | 해당 유저 | "30분 뒤 자동 폐기됩니다" |
| 22:00 | 오늘 목표 미달자만 | 마감 리마인드 |
| 판정 fail 즉시 | 해당 유저 | 앱을 닫은 뒤 fail이 나면 세션이 통째로 날아간다 |
| 08:00 | 어제 `failed`인 유저만 | streak 끊김 + 복구 유도. **매출 직결** |

정산 자체(04:00)는 알리지 않는다. `success`·`passed` 유저에게도 알리지 않는다.

**친구 인증 알림은 넣지 않는다.** 그룹 5명 × 하루 2세션이면 하루 16통이고,
다중 그룹이면 그 배수가 된다. 알림 피로가 즉시 온다. 앱을 열면 피드에 다 보인다.

---

## 6. AI 판정

### 6.1 어댑터

```
JudgeProvider.judge(image_bytes, context) -> Verdict
    ├ providers/claude.py      ← v1 기본값
    ├ providers/openai.py
    └ providers/gemini.py
```

`JUDGE_PROVIDER` / `JUDGE_MODEL` env로 교체. 프롬프트 텍스트는 프로바이더가 공유한다(공정 비교 전제).

**v1 기본값: `claude-haiku-4-5`.**

### 6.2 이미지 전처리

업로드 즉시 서버가 **긴 변 1280px, JPEG q80**으로 리사이즈한다. 원본은 남기지 않는다.

장당 2MB → 약 200KB. S3 비용이 1년 누적 기준 월 $66에서 월 $7 수준으로 떨어지고,
**vision 입력 토큰이 함께 줄어 AI 원가에도 직결된다.** 판정에 1280px면 차고 넘친다.

### 6.3 판정 정책

**pass 범위는 넓게.** 책상·도서관·카페에서 무언가에 집중하는 장면이면 통과시킨다.
종이책, 노트북 코딩, 태블릿 필기, 인강 모두 포함한다. 게임 화면·예능·SNS·음식·
사람 얼굴만 확실한 fail이다. 좁게 잡으면 직장인과 개발자를 통째로 잃는다.

**모니터에 띄운 사진이나 인쇄물을 재촬영한 것은 fail이다.** pHash·EXIF 차단을
v1에서 빼기로 했으므로, 재촬영 감지는 프롬프트가 담당하는 유일한 방어선이다.

### 6.4 출력 스키마

structured output으로 고정한다.

```json
{
  "decision": "pass" | "fail",
  "confidence": 0.0 ~ 1.0,
  "reason": "한국어 한 문장"
}
```

응답 전문은 `verdicts.raw_json`에 저장한다.

### 6.5 임계값 — 관대하게

```
decision == "fail" AND confidence >= 0.7   → fail
그 외 전부                                  → pass
```

즉 **확신하는 fail만 거른다.** 애매하면 전부 통과시킨다. 어뷰징 일부를 감수하는
대신 정상 유저 오차단을 막는다. 초기에 가장 큰 이탈 원인은 어뷰저가 아니라
"제대로 공부했는데 fail 났다"이다.

`0.7`은 초기값이며 env로 조정한다. `verdicts`가 쌓이고 이의제기가 정답 라벨을
만들어주면 데이터로 다시 정한다.

### 6.6 타임아웃

10초. 초과하면 **pass 처리**하고 로그를 남긴다. 관대 원칙의 연장이며,
AI 장애로 유저의 공부 시간이 날아가는 상황을 막는다.

---

## 7. 단위경제학 — 모델 선택의 근거

AI 판정은 매출과 무관하게 **유저 수에 정비례하는 순수 원가**다. 패스권을 안 사는
무료 유저도 매일 비용을 발생시킨다.

1,000명 기준 월 원가 (하루 4장 가정, 리사이즈 전):

| 모델 | 월 원가 | 손익분기에 필요한 유료 매출 (전환율 10% 가정) |
|---|---|---|
| `claude-opus-5` | 약 200만원 | 인당 월 2만원 — 불가능 |
| `claude-sonnet-5` | 약 80만원 | 인당 월 8,000원 — 빠듯 |
| `claude-haiku-4-5` | 약 40만원 | 인당 월 4,000원 — 가능 |

패스권 개당 약 1,500원이므로 유료 유저가 월 2~3회 실패해야 본전이다.
여기서 두 가지가 따라 나온다.

1. **모델은 haiku급이어야 한다.** 상위 모델은 가격을 아무리 올려도 무료 유저 원가를 못 덮는다.
2. **패스권 개당 1,000원 미만은 성립하지 않는다.**

§6.2의 리사이즈가 이 표를 추가로 낮춘다.

---

## 8. `02-open-questions.md`에서 뒤집은 방향

| 원래 안 | 변경 | 이유 |
|---|---|---|
| S3 presigned upload (앱 → S3 직접) | **서버로 직접 업로드** (multipart POST) | 유저 1,000명이어도 사진은 분당 3장이다. presigned는 발급 API + 완료 통보 API + 미완료 정리가 붙는다. 막히면 그때 바꾼다 |
| 비동기 판정 파이프라인 | **동기 판정** | 유저는 결과를 즉시 봐야 한다(pass면 세션 시작, fail이면 재촬영). haiku는 1~3초다. 큐·워커·폴링·상태 조회가 통째로 사라진다 |
| App Store / Google Play 자체 영수증 검증 | **RevenueCat** | SDK·키·갱신 처리가 2종이다. 월 매출 $2,500까지 무료고 웹훅 하나면 된다. 넘으면 그때 자체 검증 |
| 초대 딥링크 (설치 전 클릭 → 설치 후 코드 유지) | **초대코드 6자리 수동 입력** | deferred deep link는 Branch 같은 서드파티가 필요하다. 공유 버튼이 "초대코드 + 스토어 링크"를 클립보드에 복사하고 유저가 붙여넣는다 |
| pHash·EXIF 기반 차단 | **저장만, 차단 없음** | 임계값을 감으로 정하면 정상 유저를 오차단한다. 지표를 쌓아두고 실제 어뷰징이 보이면 데이터로 정한다 |

---

## 9. 인프라

| 항목 | 결정 |
|---|---|
| 서버 | Python + FastAPI + SQLAlchemy + Alembic (1부가 `providers/claude.py`로 Python을 전제) |
| 호스팅 | Lightsail t4g.small 단일 인스턴스 (결정 15) |
| DB | RDS Postgres `db.t4g.micro`, gp3 20GB, 자동 백업 7일. 결제 데이터가 있으므로 EC2 자체 설치는 안 한다 |
| 스토리지 | S3. 리사이즈된 JPEG만. 라이프사이클 정책 없음 |
| 배치 | **서버 cron** 04:00 KST. 서버리스가 아니므로 EventBridge는 불필요 |
| 시크릿 | `.env` (퍼미션 600). 서버 하나에 시크릿 5개라 Secrets Manager는 비용과 코드만 는다 |
| 앱 | Expo (RN) — `expo-camera`, `expo-notifications`, RevenueCat SDK |

---

## 10. v1 이후로 미루는 것

- pHash·EXIF 임계 기반 자동 차단 (지표가 쌓인 뒤)
- 판정 모델 재선정 (`verdicts` + 이의제기 라벨로 3사 비교)
- 순위표
- deferred deep link
- 자체 IAP 영수증 검증 (RevenueCat 무료 티어 초과 시)
- presigned upload / 비동기 판정 (서버가 실제로 막힐 때)
