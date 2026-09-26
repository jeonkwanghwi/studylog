# AWS 리소스 (2026-09-11 생성)

계정 `993232132996`, 리전 `ap-northeast-2`. 모든 리소스에 `Project=studylog` 태그.

> 이 계정에는 다른 프로젝트(define)도 있다. **네트워크는 완전히 분리했다** —
> studylog 전용 VPC를 따로 만들었고 기본 VPC에는 studylog 리소스가 없다.
> 공유되는 것은 계정 자체(IAM·청구·서비스 한도)뿐이다.
> 비용을 프로젝트별로 보려면 결제 콘솔에서 `Project` 태그를 **비용 할당 태그로
> 활성화**해야 한다 (루트 권한 필요, 아직 안 했음).

| 항목 | 값 |
|---|---|
| VPC | `vpc-0bd5973d71f7c5bde` (10.20.0.0/16) |
| 퍼블릭 서브넷 | `subnet-04dd4b26f5a48ffac` (10.20.1.0/24, ap-northeast-2a) |
| 프라이빗 서브넷 | `subnet-07a63a80073bee8e2`, `subnet-013939b686fcb86b4` |
| EC2 | `i-094633da31340997b` t4g.small, Ubuntu 24.04 arm64 |
| 고정 IP | `54.116.69.38` (`eipalloc-0faa017e754fe2036`) |
| RDS | `studylog-db` db.t4g.micro, Postgres 18.3, 백업 7일 |
| S3 | `studylog-photos-6ca70a39` — 퍼블릭 전면 차단, AES256 |
| 보안그룹 | API `sg-0422a4aad4052e1a3` / DB `sg-0efe46c7d893f4c43` |
| IAM | 역할 `studylog-ec2` — 위 버킷 객체에만 put/get/delete |
| SSH 키 | `~/.ssh/studylog-key.pem` (로컬에만 존재. 잃어버리면 재발급 불가) |

## 네트워크 규칙

- SSH(22)는 **등록된 관리자 IP에서만**. IP가 바뀌면 규칙을 갱신해야 한다:
  `aws ec2 authorize-security-group-ingress --group-id sg-0422a4aad4052e1a3 --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$(curl -s https://checkip.amazonaws.com)/32}]"`
- 80/443은 공개. RDS 5432는 **API 보안그룹에서만** — 퍼블릭 액세스 없음,
  프라이빗 서브넷에 인터넷 경로 자체가 없다.

## 접속 — SSH 대신 SSM 을 쓴다 (2026-09-25)

집 인터넷이 유동 IP라 SSH 화이트리스트가 며칠마다 어긋난다. 그때 SSH 가
타임아웃 나는데 **서버가 죽은 것처럼 보여서** 엉뚱한 곳을 뒤지게 된다.
실제로 한 번 그랬다 — 알고 보니 인스턴스가 정지 상태였다.

`studylog-ec2` 역할에 `AmazonSSMManagedInstanceCore` 를 붙였다. 인스턴스가
밖으로 HTTPS 를 걸어 나가는 방식이라 **들어오는 포트가 필요 없고, IP 가
바뀌어도 아무것도 안 해도 된다.**

```
server/deploy/ssm.sh <<'EOF'      # 서버에서 명령 실행 (root)
systemctl status studylog
EOF
server/deploy/allow-my-ip.sh      # SSH 를 꼭 써야 할 때만. 옛 규칙은 지운다
```

`allow-my-ip.sh` 가 옛 규칙을 반드시 회수하는 이유: 유동 IP 는 곧 남에게
넘어가므로, 쌓아두면 모르는 사람에게 SSH 문을 열어둔 채로 두는 셈이 된다.

## HTTPS — 완료 (2026-09-25)

도메인 `studylog.co.kr` (가비아, 2027-09-24 만료)을 붙이고 certbot 으로
TLS 를 걸었다.

| | |
|---|---|
| `https://api.studylog.co.kr` | API. nginx → `127.0.0.1:8000` |
| `https://studylog.co.kr` | 약관·지원 페이지 자리 (`/var/www/studylog`) |
| 인증서 | Let's Encrypt, 2026-12-24 만료, `certbot.timer` 자동 갱신 |
| HTTP | 301 로 HTTPS 리다이렉트 |
| `http://54.116.69.38` | **남겨뒀다** — 지금 폰에 깔린 빌드가 이걸 본다 |

`client_max_body_size 12M` 이 443 블록에도 살아 있는지 확인했다(2MB POST →
401, 413 아님). 없으면 사진 업로드가 nginx 기본 1MB 에서 잘린다.

앱 쪽에서는 `NSAppTransportSecurity` 의 IP 예외와 `usesCleartextTraffic` 을
지웠다. 다만 **그냥 지우면 안 된다** — Expo 기본 Info.plist 템플릿이
`NSAllowsArbitraryLoads: true` 를 넣기 때문에(`@expo/config-plugins` 의
`withIosBaseMods.js`), 빼는 순간 "모든 평문 허용"이 프로덕션에 실려 나간다.
그래서 명시적으로 `false` 로 잠그고, 개발 서버용으로 `NSAllowsLocalNetworking`
만 열어뒀다.

## 아직 안 된 것

1. `.env` 의 `ANTHROPIC_API_KEY` 가 비어 있다 (OpenAI 로 판정하므로 당장은
   문제없다). `OPENAI_API_KEY` 는 들어 있고 `JUDGE_MODEL=gpt-5-mini` 다.
2. 소셜 로그인 client id, RevenueCat 키가 비어 있다.
3. 앱이 아직 `http://54.116.69.38` 을 보는 빌드다. 새 빌드를 내면
   `https://api.studylog.co.kr` 로 붙는다 (EAS 환경변수는 세 환경 모두 갱신함).

## 검증 완료 (2026-09-11, 실제 Postgres)

- `alembic upgrade head` → 성공. 손으로 쓴 `0001_initial`의 첫 실전.
- `alembic check` → `No new upgrade operations detected.`
  (첫 시도는 실패했다 — 유니크 제약 이름 규칙이 어긋나 있었고 고쳤다.)
- **FOR UPDATE 동시성**: 잔액 5,000원에 1,000원씩 14개 스레드 동시 차감 →
  정확히 5번 성공 / 9번 거부, 잔액 0, `balance_after` 중복 없음.
  SQLite에서는 락이 no-op라 증명할 수 없던 것이다.

## 배포 (2회차부터)

```bash
git archive --format=tar HEAD server | ssh -i ~/.ssh/studylog-key.pem ubuntu@54.116.69.38 \
  'sudo -u studylog tar -x -C /srv/studylog'
ssh -i ~/.ssh/studylog-key.pem ubuntu@54.116.69.38 \
  'sudo -u studylog /srv/studylog/venv/bin/pip install -q -e /srv/studylog/server &&
   sudo -u studylog bash -c "cd /srv/studylog/server && ../venv/bin/alembic check" &&
   sudo -u studylog bash -c "cd /srv/studylog/server && ../venv/bin/alembic upgrade head" &&
   sudo systemctl restart studylog'
curl http://54.116.69.38/health
```


## 비용을 아끼려 껐다가 겪은 일 (2026-09-21 ~ 09-25)

애플 등록이 막혀 진도가 없던 동안 EC2 를 정지하고 RDS 를 **최종 스냅샷을
뜨고 삭제**했다. 다시 켤 때 알게 된 것들:

- **고정 IP 는 인스턴스가 꺼져 있어도 과금된다** (월 ~3,600원). 도메인이
  이 IP 를 가리키므로 놓으면 안 된다.
- RDS 를 스냅샷에서 복원했더니 **엔드포인트가 그대로였다**
  (`studylog-db.cjgc2gy46fpq...`). `.env` 를 고칠 필요가 없었다.
- 데이터도 온전했다: alembic `0002`, users 1 / photos 3 / verdicts 3 /
  daily_records 2.

정지·삭제 자체는 합리적이었다. 다만 **지우기 전에 스냅샷을 뜬 것**이
결정적이었다 — 안 떴으면 복구할 방법이 없었다.