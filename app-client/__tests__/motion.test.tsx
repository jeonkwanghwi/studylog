import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";

import { Button } from "../src/design/Button";
import { Skeleton } from "../src/design/Skeleton";
import { Toast } from "../src/design/Toast";
import { Touchable } from "../src/design/Touchable";
import { haptic } from "../src/design/motion";

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));

const Haptics = jest.requireMock("expo-haptics") as {
  impactAsync: jest.Mock;
  notificationAsync: jest.Mock;
};

afterEach(() => jest.clearAllMocks());

describe("누르는 반응", () => {
  it("애니메이션 래퍼가 onPress 를 삼키지 않는다", async () => {
    // Touchable 은 자식을 Animated.View 로 감싼다. 감싸는 순간 터치가
    // 안쪽에서 멈추면 앱의 모든 버튼이 조용히 죽는다.
    const onPress = jest.fn();
    await render(<Button label="공부 시작" onPress={onPress} />);
    await fireEvent.press(screen.getByText("공부 시작"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("비활성 버튼은 눌리지도, 진동하지도 않는다", async () => {
    const onPress = jest.fn();
    await render(<Button label="카메라 열기" disabled onPress={onPress} />);
    await fireEvent.press(screen.getByText("카메라 열기"));
    expect(onPress).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it("누르면 가볍게 진동한다", async () => {
    await render(
      <Touchable onPress={() => {}}>
        <Text>눌러</Text>
      </Touchable>
    );
    await fireEvent(screen.getByText("눌러"), "pressIn");
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it("화면이 바뀌지 않는 토글은 진동을 끈다", async () => {
    // 필터를 고르는 것까지 진동하면 진동이 아무 의미도 전달하지 못한다.
    await render(
      <Touchable feedback={false} onPress={() => {}}>
        <Text>고시반</Text>
      </Touchable>
    );
    await fireEvent(screen.getByText("고시반"), "pressIn");
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it("결과 진동은 통과와 거절을 구분한다", () => {
    haptic.success();
    haptic.warning();
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(1, "success");
    expect(Haptics.notificationAsync).toHaveBeenNthCalledWith(2, "warning");
  });
});

describe("처리 중 버튼", () => {
  it("라벨 대신 스피너를 보여주고 다시 눌리지 않는다", async () => {
    // 결제 버튼이 흐려지기만 하면 안 눌린 건지 처리 중인지 알 수 없어
    // 유저가 한 번 더 누른다. 결제는 두 번 누르면 안 되는 동작이다.
    const onPress = jest.fn();
    await render(<Button label="결제하고 시작" loading onPress={onPress} />);
    expect(screen.queryByText("결제하고 시작")).toBeNull();
    await fireEvent.press(screen.getByRole("button"));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("동작 줄이기", () => {
  it("켜져 있으면 자리표시자가 깜빡이지 않는다", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(true);
    await render(<Skeleton />);
    // 고정 불투명도여야 한다 — Animated 값이면 숫자가 아니다.
    const style = screen.getByTestId("skeleton").props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style.flat()) : style;
    expect(typeof flat.opacity).toBe("number");
  });
});

describe("토스트", () => {
  it("메시지가 없으면 아무것도 그리지 않는다", async () => {
    await render(<Toast message={null} onHide={() => {}} />);
    expect(screen.queryByText("초대코드를 복사했어요")).toBeNull();
  });

  it("메시지가 있으면 보여준다", async () => {
    await render(<Toast message="초대코드를 복사했어요" onHide={() => {}} />);
    expect(screen.getByText("초대코드를 복사했어요")).toBeTruthy();
  });
});
