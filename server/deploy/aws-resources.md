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

## 아직 안 된 것

1. **HTTPS가 없다.** 도메인이 없어서 80 포트 평문으로 떠 있다. JWT가 평문으로
   오간다는 뜻이므로 **실유저를 받기 전에 반드시** 도메인을 붙이고 certbot으로
   TLS를 건다. RevenueCat 웹훅도 HTTPS를 요구한다.
2. `.env`의 `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`가 비어 있다 — 판정이
   관대 폴백으로 전부 통과한다. 판정 모델을 정하고 키를 넣어야 한다.
3. 소셜 로그인 client id, RevenueCat 키가 비어 있다.

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
