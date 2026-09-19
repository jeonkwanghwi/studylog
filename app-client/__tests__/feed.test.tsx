import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";

import Feed from "../app/(tabs)/feed";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

const groups = [{ id: "g1", name: "고시반", invite_code: "A3K9P2" }];

const feed = [
  {
    user_id: "u1", nickname: "광휘", streak_count: 5,
    total_minutes: 95, goal_minutes: 60, result: null,
    photos: [
      { kind: "start", url: "http://x/1.jpg", received_at: "2026-09-10T01:00:00Z" },
      { kind: "end", url: "http://x/2.jpg", received_at: "2026-09-10T02:35:00Z" },
    ],
  },
  {
    user_id: "u2", nickname: "친구", streak_count: 0,
    total_minutes: 0, goal_minutes: 120, result: "failed", photos: [],
  },
];

function mockApi(items = feed, list = groups) {
  jest.spyOn(global, "fetch").mockImplementation((url) => {
    const path = String(url).replace("http://127.0.0.1:8000", "");
    const body = path === "/groups" ? list : items;
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  });
}

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Feed />
    </QueryClientProvider>
  );

afterEach(() => jest.restoreAllMocks());

describe("피드", () => {
  it("그룹원의 오늘 진행 상황을 보여준다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("광휘")).toBeTruthy());
    expect(screen.getByText("1시간 35분 / 60분")).toBeTruthy();
  });

  it("정산된 실패는 박제한다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("미인증")).toBeTruthy());
  });

  it("아직 정산 전이면 결과를 단정하지 않는다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("광휘")).toBeTruthy());
    // 광휘는 result 가 null 이므로 미인증 표시가 붙으면 안 된다
    expect(screen.getAllByText("미인증")).toHaveLength(1);
    // null 은 실패도 성공도 아니다 — 어떤 정산 마크도 달리면 안 된다
    expect(screen.queryByText("달성")).toBeNull();
    expect(screen.queryByText("복구됨")).toBeNull();
  });

  it("사진을 그대로 보여준다 — 가리지 않는다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getAllByTestId("feed-photo")).toHaveLength(2));
  });

  it("오늘 아무것도 안 한 멤버도 0분·사진 없음으로 나타난다", async () => {
    mockApi();
    await wrap();
    await waitFor(() => expect(screen.getByText("친구")).toBeTruthy());
    expect(screen.getByText("0분 / 120분")).toBeTruthy();
  });

  it("그룹이 없으면 참여를 권한다", async () => {
    mockApi(feed, []);
    await wrap();
    await waitFor(() =>
      expect(screen.getByText(/그룹에 참여하면/)).toBeTruthy()
    );
  });
});
