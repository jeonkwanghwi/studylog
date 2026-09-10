/** 서버 주소는 환경변수로만 들어온다. 소스에 도메인을 박지 않는다. */
export function apiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL 이 설정되지 않았습니다. .env 를 확인하세요."
    );
  }
  return url.replace(/\/$/, "");
}
