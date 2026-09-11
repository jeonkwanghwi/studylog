import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";

import Login from "../app/login";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));

// Apple 은 자사 버튼 컴포넌트를 써야 심사를 통과한다. 커스텀 버튼으로
// 흉내내면 반려되므로, 그 컴포넌트가 실제로 쓰이는지 여기서 지킨다.
jest.mock("expo-apple-authentication", () => {
  const { Text } = require("react-native");
  return {
    AppleAuthenticationButton: ({ onPress }: { onPress: () => void }) => (
      <Text onPress={onPress}>APPLE_OFFICIAL_BUTTON</Text>
    ),
    AppleAuthenticationButtonType: { CONTINUE: "continue" },
    AppleAuthenticationButtonStyle: { BLACK: "black" },
  };
});

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
      expect(alertSpy).toHaveBeenCalledWith("로그인하지 못했습니다", "서버에 연결할 수 없습니다.")
    );
  });

  it("구글 로그인이 서버에서 거절되면 실패를 알린다 — 예전에는 조용히 무시됐다", async () => {
    mockSignIn.mockRejectedValue(new Error("서버에 연결할 수 없습니다."));
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    mockGoogleIdToken = "google-id-token";

    await wrap();

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("로그인하지 못했습니다", "서버에 연결할 수 없습니다.")
    );
  });
});

describe("로그인 화면 규정", () => {
  it("Apple 은 자사 공식 버튼 컴포넌트를 쓴다", async () => {
    // 색·문구를 우리 마음대로 만든 버튼은 App Review 에서 반려된다.
    await wrap();
    expect(screen.getByText("APPLE_OFFICIAL_BUTTON")).toBeTruthy();
  });

  it("카카오 버튼은 브랜드 규정 문구를 쓴다", async () => {
    await wrap();
    expect(screen.getByText("카카오 로그인")).toBeTruthy();
  });

  it("무엇을 하는 앱인지 먼저 말한다", async () => {
    // 로그인 화면은 유저가 보는 첫 화면이다. 돈을 거는 앱이 이름만
    // 띄워놓고 계정을 요구하면 신뢰를 얻지 못한다.
    await wrap();
    expect(screen.getByText(/돌려받아요/)).toBeTruthy();
  });
});
