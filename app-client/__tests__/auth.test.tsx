import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";

import { useAuth } from "../src/auth/useAuth";

jest.mock("expo-secure-store");

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe("인증", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  });

  it("토큰이 없으면 signedOut 이다", async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
  });

  it("저장된 토큰이 있으면 signedIn 으로 시작한다", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("tok");
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));
  });

  it("로그인하면 토큰을 SecureStore 에 넣는다", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "new-tok",
        user: { id: "u1", nickname: "광휘", daily_goal_minutes: 60,
                pending_goal_minutes: null, streak_count: 0, credit_balance: 0 },
      }),
    } as Response);

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    await act(() => result.current.signIn("apple", "id-token", "광휘"));

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("studylog.token", "new-tok");
    await waitFor(() => expect(result.current.status).toBe("signedIn"));
  });

  it("로그아웃하면 토큰을 지운다", async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue("tok");
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    await act(() => result.current.signOut());
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("studylog.token");
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
  });
});
