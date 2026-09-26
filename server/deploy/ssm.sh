#!/usr/bin/env bash
# SSM 으로 서버에서 명령을 실행하고 결과를 기다려 출력한다.
#
# SSH 대신 이걸 쓰는 이유: 집 인터넷이 유동 IP라 SSH 화이트리스트가 며칠마다
# 어긋난다. SSM 은 인스턴스가 밖으로 HTTPS 를 걸어 나가는 방식이라 들어오는
# 포트가 필요 없다 — IP 가 바뀌어도 아무것도 안 해도 된다.
#
# 명령은 파이프로 받는다. 따옴표가 섞인 스크립트를 shorthand 로 넘기면
# aws-cli 파서가 깨지므로 JSON 파일로 만들어 전달한다.
#
# 사용: ./ssm.sh < script.sh   또는   echo '명령' | ./ssm.sh
set -euo pipefail

INSTANCE=i-094633da31340997b
REGION=ap-northeast-2

PAYLOAD=$(mktemp)
trap 'rm -f "$PAYLOAD"' EXIT
python3 -c 'import json,sys; print(json.dumps({"commands":[sys.stdin.read()]}))' > "$PAYLOAD"

CMD_ID=$(aws ssm send-command --region "$REGION" \
  --instance-ids "$INSTANCE" \
  --document-name AWS-RunShellScript \
  --parameters "file://$PAYLOAD" \
  --query 'Command.CommandId' --output text)

STATUS=Pending
for _ in $(seq 1 90); do
  STATUS=$(aws ssm get-command-invocation --region "$REGION" \
    --command-id "$CMD_ID" --instance-id "$INSTANCE" \
    --query 'Status' --output text 2>/dev/null || echo Pending)
  [[ "$STATUS" == "InProgress" || "$STATUS" == "Pending" ]] || break
  sleep 2
done

aws ssm get-command-invocation --region "$REGION" \
  --command-id "$CMD_ID" --instance-id "$INSTANCE" \
  --query 'StandardOutputContent' --output text
ERR=$(aws ssm get-command-invocation --region "$REGION" \
  --command-id "$CMD_ID" --instance-id "$INSTANCE" \
  --query 'StandardErrorContent' --output text)
[[ -n "$ERR" && "$ERR" != "None" ]] && { echo "--- stderr ---"; echo "$ERR"; }
echo "[$STATUS]"
