import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import Select from "../app/challenge/select";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

const mockBuyProduct = jest.fn();
const mockInitPurchases = jest.fn();
jest.mock("../src/purchases/revenuecat", () => ({
  initPurchases: (...args: unknown[]) => mockInitPurchases(...args),
  buyProduct: (...args: unknown[]) => mockBuyProduct(...args),
}));

const products = [
  { product_id: "challenge_7d_1k", days: 7, daily_payback: 1000,
    price: 7000, completion_bonus: 0 },
  { product_id: "challenge_30d_1k", days: 30, daily_payback: 1000,
    price: 30000, completion_bonus: 3000 },
];

const me = {
  id: "u1", nickname: "광휘", daily_goal_minutes: 60,
  pending_goal_minutes: null, streak_count: 0, credit_balance: 30000,
};

function mockApi(overrides: Record<string, unknown> = {}) {
  jest.spyOn(global, "fetch").mockImplementation((url) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    const body =
      overrides[path] ??
      { "/challenges/products": products, "/users/me": me }[path] ??
      null;
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Select />
    </QueryClientProvider>
  );

afterEach(() => {
  jest.restoreAllMocks();
  mockBuyProduct.mockReset();
  mockInitPurchases.mockReset();
});

describe("챌린지 선택", () => {
  it("RevenueCat 의 appUserID 를 서버 user.id 로 맞춘다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(mockInitPurchases).toHaveBeenCalledWith("u1"));
  });

  it("서버가 준 목록만 보여준다 — 하드코딩된 가격표가 없다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("7일")).toBeTruthy());
    expect(screen.getByText("30일")).toBeTruthy();
    expect(screen.queryByText("90일")).toBeNull();
  });

  it("참가비와 완주 보너스를 함께 보여준다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("30,000")).toBeTruthy());
    expect(screen.getByText(/완주 시 3,000원/)).toBeTruthy();
  });

  it("크레딧이 충분하면 크레딧 참가를 제안한다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getAllByText("크레딧으로 참가").length).toBeGreaterThan(0));
  });

  it("크레딧이 모자라면 결제로만 참가한다", async () => {
    mockApi({ "/users/me": { ...me, credit_balance: 0 } });
    await wrap();
    await waitFor(() => expect(screen.getAllByText("결제하고 시작").length).toBe(2));
    expect(screen.queryByText("크레딧으로 참가")).toBeNull();
  });

  it("결제는 RevenueCat 을 거치고 서버에 직접 알리지 않는다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getAllByText("결제하고 시작").length).toBe(2));

    await fireEvent.press(screen.getAllByText("결제하고 시작")[0]);
    await waitFor(() => expect(mockBuyProduct).toHaveBeenCalledWith("challenge_7d_1k"));

    const posted = (global.fetch as jest.Mock).mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST"
    );
    expect(posted).toHaveLength(0);
  });

  // 웹훅이 도착하기 전에는 챌린지가 없다. 그 사이 화면을 나가거나 결제
  // 버튼을 다시 누르게 두면 두 번째 결제가 나가고 서버는 챌린지를 열어주지
  // 않는다(활성 챌린지 있음) — 돈만 사라진다.
  describe("결제 확인 대기", () => {
    it("결제 성공 뒤 챌린지가 나타날 때까지 화면에 머물고, 그 동안 결제 버튼을 다시 눌러도 소용없다", async () => {
      const overrides = { "/challenges/current": null as unknown };
      mockApi(overrides);
      mockBuyProduct.mockResolvedValue(undefined);
      await wrap();
      await waitFor(() => expect(screen.getAllByText("결제하고 시작").length).toBe(2));

      await fireEvent.press(screen.getAllByText("결제하고 시작")[0]);
      await waitFor(() => expect(mockBuyProduct).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(screen.getByText(/결제를 확인하는 중입니다/)).toBeTruthy());

      // 다시 눌러도 두 번째 결제는 나가지 않는다 — 버튼이 막혀 있다.
      await fireEvent.press(screen.getAllByText("결제하고 시작")[0]);
      expect(mockBuyProduct).toHaveBeenCalledTimes(1);
      expect(router.back).not.toHaveBeenCalled();
    });

    it("폴링 중 웹훅이 도착해 챌린지가 나타나면 화면을 나간다", async () => {
      const overrides = { "/challenges/current": null as unknown };
      mockApi(overrides);
      mockBuyProduct.mockResolvedValue(undefined);
      const setIntervalSpy = jest.spyOn(global, "setInterval");

      await wrap();
      await waitFor(() => expect(screen.getAllByText("결제하고 시작").length).toBe(2));
      await fireEvent.press(screen.getAllByText("결제하고 시작")[0]);
      await waitFor(() => expect(screen.getByText(/결제를 확인하는 중입니다/)).toBeTruthy());

      expect(setIntervalSpy).toHaveBeenCalled();
      const pollCall = setIntervalSpy.mock.calls.find((c) => c[1] === 2_000);
      const poll = pollCall?.[0] as () => void;

      // 웹훅이 이제 막 도착해서 서버가 챌린지를 연 상태를 흉내낸다.
      overrides["/challenges/current"] = {
        id: "c1", product_id: "challenge_7d_1k", entry_amount: 7000,
        daily_payback: 1000, completion_bonus: 0, total_days: 7,
        started_on: "2026-09-11", ends_on: "2026-09-17",
        paid_with: "iap", status: "active",
      };
      await act(async () => {
        poll();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      await waitFor(() => expect(router.back).toHaveBeenCalled(), { timeout: 3000 });
    });

    it("30초가 지나도 챌린지가 안 보이면 결제는 끝났다고 안내하고, 버튼은 계속 막아둔다", async () => {
      const overrides = { "/challenges/current": null as unknown };
      mockApi(overrides);
      mockBuyProduct.mockResolvedValue(undefined);
      const setIntervalSpy = jest.spyOn(global, "setInterval");
      let now = 1_700_000_000_000;
      jest.spyOn(Date, "now").mockImplementation(() => now);

      await wrap();
      await waitFor(() => expect(screen.getAllByText("결제하고 시작").length).toBe(2));
      await fireEvent.press(screen.getAllByText("결제하고 시작")[0]);
      await waitFor(() => expect(screen.getByText(/결제를 확인하는 중입니다/)).toBeTruthy());

      const pollCall = setIntervalSpy.mock.calls.find((c) => c[1] === 2_000);
      const poll = pollCall?.[0] as () => void;
      now += 31_000;
      await act(async () => {
        poll();
        await Promise.resolve();
      });

      await waitFor(() =>
        expect(screen.getByText(/결제가 완료됐습니다/)).toBeTruthy()
      );
      expect(screen.getByText("새로고침")).toBeTruthy();

      // 시간이 지나 버튼 문구가 바뀌어도 재구매는 여전히 막혀 있다.
      await fireEvent.press(screen.getAllByText("결제하고 시작")[0]);
      expect(mockBuyProduct).toHaveBeenCalledTimes(1);
    });
  });
});
