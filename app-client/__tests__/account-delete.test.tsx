import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import DeleteAccount from "../app/account/delete";
import type { ChallengeOut, UserOut } from "../src/api/types";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
}));
jest.mock("expo-secure-store");

// jest.mock 의 팩토리는 바깥 변수를 못 본다. mock 접두사가 붙은 것만 허용된다.
const mockSignOut = jest.fn();
jest.mock("../src/auth/useAuth", () => ({ useAuth: () => ({ signOut: mockSignOut }) }));

const me: UserOut = {
  id: "u1", nickname: "광휘", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 3, credit_balance: 4000,
};

const challenge: ChallengeOut = {
  id: "c1", product_id: "challenge_7d_1k", entry_amount: 7000,
  daily_payback: 1000, completion_bonus: 0, total_days: 7,
  started_on: "2026-09-20", ends_on: "2026-09-26", status: "active",
  paid_with: "iap",
};

/** DELETE 응답만 따로 흉내낼 수 있게 한다. */
function mockApi({ deleteFails = false } = {}) {
  jest.spyOn(global, "fetch").mockImplementation((url, init) => {
    const method = (init as RequestInit | undefined)?.method;
    if (method === "DELETE") {
      return Promise.resolve({
        ok: !deleteFails,
        status: deleteFails ? 500 : 204,
        json: async () => ({ detail: "서버가 응답하지 않습니다." }),
      } as Response);
    }
    const path = String(url);
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => (path.includes("/challenges/current") ? challenge : me),
    } as Response);
  });
}

const wrap = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <DeleteAccount />
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());
beforeEach(() => jest.clearAllMocks());

describe("회원 탈퇴", () => {
  it("사라지는 것을 그 사람의 실제 숫자로 보여준다", async () => {
    // "일부 데이터가 삭제됩니다" 같은 뭉뚱그린 문구로는 무엇을 잃는지
    // 알 수 없다. 남은 크레딧과 진행 중인 챌린지를 그대로 보여준다.
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText(/크레딧 4,000원이 소멸/)).toBeTruthy());
    expect(screen.getByText(/진행 중인 7일 챌린지가 종료/)).toBeTruthy();
  });

  it("확인 표시를 하기 전에는 탈퇴 버튼이 눌리지 않는다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("탈퇴하기")).toBeTruthy());

    await fireEvent.press(screen.getByText("탈퇴하기"));
    const called = (global.fetch as jest.Mock).mock.calls.some(
      ([, init]) => (init as RequestInit | undefined)?.method === "DELETE"
    );
    expect(called).toBe(false);
  });

  it("확인한 뒤에야 지워지고, 토큰까지 함께 버린다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("위 내용을 확인했습니다")).toBeTruthy());

    await fireEvent.press(screen.getByText("위 내용을 확인했습니다"));
    await fireEvent.press(screen.getByText("탈퇴하기"));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    // 서버에서 사라진 계정의 토큰을 들고 로그인 화면 밖에 머물면 안 된다.
    expect(router.replace).toHaveBeenCalledWith("/login");
  });

  it("실패하면 이유를 말하고 화면에 남는다", async () => {
    // 조용히 로그인 화면으로 보내면 탈퇴된 줄 알지만 계정은 살아 있다.
    mockApi({ deleteFails: true });
    await wrap();
    await waitFor(() => expect(screen.getByText("위 내용을 확인했습니다")).toBeTruthy());

    await fireEvent.press(screen.getByText("위 내용을 확인했습니다"));
    await fireEvent.press(screen.getByText("탈퇴하기"));

    await waitFor(() => expect(screen.getByText(/탈퇴하지 못했습니다/)).toBeTruthy());
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
