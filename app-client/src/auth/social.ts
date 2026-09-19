import * as AppleAuthentication from "expo-apple-authentication";
import * as AuthSession from "expo-auth-session";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";

// 리다이렉트로 브라우저가 열렸다가 앱으로 돌아올 때 대기 중인 프라미스를
// 정리해줘야 한다 — 안 하면 두 번째 로그인 시도부터 응답이 오지 않는다.
WebBrowser.maybeCompleteAuthSession();

export class AppleUnavailable extends Error {
  constructor() {
    super("이 기기에서는 Apple 로그인을 쓸 수 없습니다.");
    this.name = "AppleUnavailable";
  }
}

/** 사용자가 Apple 시트에서 취소했을 때. 화면은 이 경우 아무것도 보여주지 않아야 한다. */
export class AppleCanceled extends Error {
  constructor() {
    super("사용자가 Apple 로그인을 취소했습니다.");
    this.name = "AppleCanceled";
  }
}

/**
 * 서버가 Apple JWKS 로 실제 검증하므로 진짜 identityToken 이 필요하다.
 * null 을 그대로 보내면 서버에서 401 이 되는데, 그러면 원인이 로그인 취소인지
 * 토큰 문제인지 화면에서 구분할 수 없다. 여기서 먼저 끊는다.
 */
export async function signInWithApple(): Promise<string> {
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new AppleUnavailable();
  }
  let credential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    // expo-apple-authentication 은 취소 시 code: "ERR_REQUEST_CANCELED" 로 reject 한다.
    if ((error as { code?: string })?.code === "ERR_REQUEST_CANCELED") {
      throw new AppleCanceled();
    }
    throw error;
  }
  if (!credential.identityToken) {
    throw new Error("Apple 이 identityToken 을 주지 않았습니다.");
  }
  return credential.identityToken;
}

const KAKAO_DISCOVERY = {
  authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
  tokenEndpoint: "https://kauth.kakao.com/oauth/token",
};

/**
 * 카카오는 네이티브 SDK 없이 expo-auth-session 의 authorization code flow로 받는다.
 * scope 에 openid 가 빠지면 access_token 만 오고 id_token 이 없어 서버가
 * 검증할 것이 없어진다. code 를 받은 뒤 token 엔드포인트와 교환해서
 * id_token 을 꺼낸다 — 교환에 실패하거나 id_token 이 비어 있으면
 * idToken 은 null 로 남겨 화면이 null 을 서버로 보내지 않게 한다.
 */
export function useKakaoIdToken() {
  const clientId = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY ?? "";
  const configured = clientId.length > 0;
  const redirectUri = AuthSession.makeRedirectUri();
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    { clientId, scopes: ["openid"], redirectUri },
    KAKAO_DISCOVERY
  );
  const [idToken, setIdToken] = useState<string | null>(null);

  useEffect(() => {
    if (response?.type !== "success" || !request) return;
    AuthSession.exchangeCodeAsync(
      {
        clientId,
        code: response.params.code,
        redirectUri,
        extraParams: request.codeVerifier
          ? { code_verifier: request.codeVerifier }
          : undefined,
      },
      KAKAO_DISCOVERY
    ).then((token) => {
      if (token.idToken) setIdToken(token.idToken);
    });
  }, [response, request, clientId, redirectUri]);

  return { request: configured ? request : null, promptAsync, idToken };
}

export type IdTokenHook = {
  request: unknown | null;
  promptAsync: () => Promise<unknown>;
  idToken: string | null;
};

/**
 * Google 은 훅으로만 쓸 수 있다(리다이렉트를 화면 생명주기에 묶는다).
 * clientId 는 서버의 GOOGLE_CLIENT_ID 와 같아야 한다 — 다르면 서버가
 * audience 검증에서 떨어뜨린다. response.params.id_token 이 비어 있으면
 * idToken 을 null 로 두어, 화면이 빈 토큰을 서버로 보내지 않게 한다.
 */
function useConfiguredGoogle(): IdTokenHook {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });
  const idToken =
    response?.type === "success" && response.params.id_token
      ? response.params.id_token
      : null;

  return { request, promptAsync, idToken };
}

/** 설정이 없을 때. request 가 null 이라 화면이 버튼을 잠근다. */
function useUnconfiguredGoogle(): IdTokenHook {
  return { request: null, promptAsync: async () => null, idToken: null };
}

/**
 * Google 설정이 없으면 useIdTokenAuthRequest 는 렌더 도중 invariant 로 던진다.
 * 그러면 Google 버튼만 죽는 게 아니라 로그인 화면 전체가 크래시해서
 * 카카오·Apple 로도 못 들어간다. 로그인 화면은 앱의 유일한 입구라
 * 한 제공자의 설정 누락이 앱 전체를 막으면 안 된다.
 *
 * 분기를 모듈 로드 시점에 고정한다 — 환경변수는 런타임에 바뀌지 않으므로
 * 컴포넌트는 항상 같은 훅을 부른다(훅 순서가 흔들리지 않는다).
 */
const GOOGLE_CONFIGURED = Boolean(
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID
);

export const useGoogleIdToken: () => IdTokenHook = GOOGLE_CONFIGURED
  ? useConfiguredGoogle
  : useUnconfiguredGoogle;
