import { focusManager } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import { AppState } from "react-native";

import RootLayout from "../app/_layout";

jest.mock("expo-router", () => ({
  Stack: Object.assign(({ children }: { children?: React.ReactNode }) => children ?? null, {
    Screen: () => null,
  }),
}));

afterEach(() => {
  focusManager.setFocused(undefined);
  jest.restoreAllMocks();
});

describe("앱 복귀", () => {
  it("포그라운드로 돌아오면 쿼리를 다시 불러온다", async () => {
    // RN 에는 window 포커스 이벤트가 없어서, 직접 이어주지 않으면 앱을
    // 두 시간 두고 돌아와도 나갈 때의 데이터가 그대로 남는다.
    const listeners: ((s: string) => void)[] = [];
    jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, fn: (s: string) => void) => {
      listeners.push(fn);
      return { remove: jest.fn() };
    }) as never);

    await render(<RootLayout />);
    expect(listeners).toHaveLength(1);

    listeners[0]("background");
    expect(focusManager.isFocused()).toBe(false);

    listeners[0]("active");
    expect(focusManager.isFocused()).toBe(true);
  });
});
