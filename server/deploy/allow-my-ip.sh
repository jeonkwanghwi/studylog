#!/usr/bin/env bash
# SSH 허용 IP 를 지금 이 컴퓨터의 공인 IP 로 갈아끼운다.
#
# 집 인터넷은 유동 IP라 며칠이면 바뀐다. 바뀌면 SSH 가 타임아웃 나는데,
# 서버가 죽은 것처럼 보여서 엉뚱한 곳을 뒤지게 된다. 실제로 한 번 그랬다.
#
# 옛 규칙을 반드시 지운다 — 유동 IP 는 곧 남에게 넘어가므로, 쌓아두면
# 모르는 사람에게 SSH 문을 열어둔 채로 두는 셈이 된다.

set -euo pipefail

GROUP=sg-0422a4aad4052e1a3
REGION=ap-northeast-2

MYIP=$(curl -s --max-time 10 https://checkip.amazonaws.com | tr -d '\n')
[[ $MYIP =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "공인 IP 를 못 읽었다: '$MYIP'"; exit 1; }

echo "현재 IP: $MYIP"

# 이미 맞으면 아무것도 하지 않는다 (여러 번 돌려도 안전하다).
CURRENT=$(aws ec2 describe-security-groups --group-ids "$GROUP" --region "$REGION" \
  --query 'SecurityGroups[0].IpPermissions[?FromPort==`22`].IpRanges[].CidrIp' --output text)

if [[ "$CURRENT" == "$MYIP/32" ]]; then
  echo "이미 허용돼 있다. 할 일 없음."
  exit 0
fi

for old in $CURRENT; do
  echo "옛 규칙 회수: $old"
  aws ec2 revoke-security-group-ingress --region "$REGION" --group-id "$GROUP" \
    --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$old}]" >/dev/null
done

aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$GROUP" \
  --ip-permissions "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$MYIP/32,Description=kwanghwi-$(date +%F)}]" >/dev/null

echo "허용 완료: $MYIP/32"
