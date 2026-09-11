import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

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
});
