import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import Login from "../app/login";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

const mockSignIn = jest.fn();
jest.mock("../src/auth/useAuth", () => ({
  useAuth: () => ({ signIn: mockSignIn }),
}));

// 카카오/구글 훅은 idToken을 즉시 갖고 있는 것처럼 흉내낸다 — 실제 소셜
// 리다이렉트 없이도 signIn 이후 경로(성공·실패)를 바로 검증하기 위해서다.
let mockKakaoIdToken: string | null = null;
let mockGoogleIdToken: string | null = null;
jest.mock("../src/auth/social", () => ({
  AppleCanceled: class extends Error {},
  AppleUnavailable: class extends Error {},
  signInWithApple: jest.fn(),
  useKakaoIdToken: () => ({
    request: {},
    promptAsync: jest.fn(),
    get idToken() {
      return mockKakaoIdToken;
    },
  }),
  useGoogleIdToken: () => ({
    request: {},
    promptAsync: jest.fn(),
    get idToken() {
      return mockGoogleIdToken;
    },
  }),
}));

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Login />
    </QueryClientProvider>
  );

afterEach(() => {
  jest.restoreAllMocks();
  mockSignIn.mockReset();
  mockKakaoIdToken = null;
  mockGoogleIdToken = null;
});

describe("로그인", () => {
  it("카카오 로그인이 서버에서 거절되면 실패를 알린다 — 예전에는 조용히 무시됐다", async () => {
    mockSignIn.mockRejectedValue(new Error("서버에 연결할 수 없습니다."));
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockKakaoIdToken = "kakao-id-token";

    await wrap();

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("로그인 실패", "서버에 연결할 수 없습니다.")
    );
  });

  it("구글 로그인이 서버에서 거절되면 실패를 알린다 — 예전에는 조용히 무시됐다", async () => {
    mockSignIn.mockRejectedValue(new Error("서버에 연결할 수 없습니다."));
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockGoogleIdToken = "google-id-token";

    await wrap();

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("로그인 실패", "서버에 연결할 수 없습니다.")
    );
  });
});
