#!/usr/bin/env bash
# 내려둔 인프라를 되살린다.
#
# 쓰지 않는 동안 EC2 를 정지하고 RDS 를 스냅샷 뜬 뒤 삭제해두는데, 되살릴
# 때마다 파라미터(서브넷 그룹·보안그룹·클래스)를 다시 찾느라 시간을 썼다.
# 그 값들을 여기 박아둔다.
#
# RDS 복원은 20분쯤 걸리지만 엔드포인트가 그대로 돌아오므로 .env 는 손댈
# 필요가 없다 — 2026-09-25 에 실제로 확인했다.
set -euo pipefail

REGION=ap-northeast-2
INSTANCE=i-094633da31340997b

SNAPSHOT=${1:-}
if [ -z "$SNAPSHOT" ]; then
  echo "사용법: $0 <스냅샷 ID>"
  echo
  echo "쓸 수 있는 스냅샷:"
  aws rds describe-db-snapshots --region "$REGION" \
    --query 'DBSnapshots[?starts_with(DBSnapshotIdentifier,`studylog`)].[DBSnapshotIdentifier,SnapshotCreateTime]' \
    --output text | sort -k2 -r | sed 's/^/  /'
  exit 1
fi

echo "=== EC2 시작 ==="
aws ec2 start-instances --instance-ids "$INSTANCE" --region "$REGION" \
  --query 'StartingInstances[0].CurrentState.Name' --output text

echo "=== RDS 복원: $SNAPSHOT ==="
aws rds restore-db-instance-from-db-snapshot --region "$REGION" \
  --db-instance-identifier studylog-db \
  --db-snapshot-identifier "$SNAPSHOT" \
  --db-instance-class db.t4g.micro \
  --db-subnet-group-name studylog-private \
  --vpc-security-group-ids sg-0efe46c7d893f4c43 \
  --no-publicly-accessible --no-multi-az --storage-type gp3 \
  --tags Key=Project,Value=studylog \
  --query 'DBInstance.DBInstanceStatus' --output text

echo "=== 복원 대기 (20분쯤) ==="
aws rds wait db-instance-available --db-instance-identifier studylog-db --region "$REGION"
aws rds describe-db-instances --db-instance-identifier studylog-db --region "$REGION" \
  --query 'DBInstances[0].Endpoint.Address' --output text

cat <<'NEXT'

다음:
  1. SSM 에이전트가 붙을 때까지 1~2분 기다린다
       aws ssm describe-instance-information --region ap-northeast-2
  2. 서비스 확인
       ./ssm.sh <<< 'systemctl is-active studylog nginx; curl -s localhost:8000/health'
  3. 인증서가 만료됐으면 갱신 (서버가 꺼져 있는 동안 certbot.timer 가 못 돈다)
       ./ssm.sh <<< 'certbot renew --nginx'
NEXT
