import { fireEvent, render, screen } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";

import { Button, TONE_LABEL, TONE_SURFACE } from "../src/design/Button";
import { color } from "../src/design/tokens";
import { LoadFailed } from "../src/design/LoadFailed";
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

describe("불러오기 실패 안내", () => {
  it("받침에 따라 을/를을 고른다", async () => {
    await render(<LoadFailed what="기록" onRetry={() => {}} />);
    expect(screen.getByText(/기록을 불러오지 못했습니다/)).toBeTruthy();
  });

  it("받침이 없으면 를을 쓴다", async () => {
    await render(<LoadFailed what="현재 상태" onRetry={() => {}} />);
    expect(screen.getByText(/현재 상태를 불러오지 못했습니다/)).toBeTruthy();
  });
});

describe("상태 뱃지", () => {
  it("기호 대신 낱말로 말한다", async () => {
    // "✓ 달성" 은 색맹 사용자에게 ✗ 와 구분되지 않고, 스크린리더는
    // "체크 달성" 이라고 읽는다.
    const { Badge } = require("../src/design/Badge");
    await render(<Badge label="달성" tone="positive" />);
    expect(screen.getByText("달성")).toBeTruthy();
    expect(screen.queryByText(/✓|✗/)).toBeNull();
  });
});

describe("화면 제목", () => {
  it("설명이 없으면 억지로 넣지 않는다", async () => {
    const { ScreenTitle } = require("../src/design/ScreenTitle");
    await render(<ScreenTitle title="설정" />);
    expect(screen.getByText("설정")).toBeTruthy();
  });
});

describe("버튼 톤", () => {
  // style 이 배열로 온다. Object.assign 은 RN 스타일 객체의 일부 키를
  // 빠뜨려서 직접 합친다.
  const flatten = (style: unknown): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const k of Object.keys(v)) out[k] = (v as Record<string, unknown>)[k];
    };
    walk(style);
    return out;
  };

  const labelStyle = (label: string) => flatten(screen.getByText(label).props.style);

  const contrast = (a: string, b: string) => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const lin = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("이차 버튼이 배경에 묻히지 않는다", () => {
    // 중립 회색(#F2F4F6)은 흰 배경 대비 1.10 이라 버튼이 없는 것처럼
    // 보였다. 강조색 계열 면은 밝기 차이도 더 크고 색상까지 달라서
    // 테두리 없이 보인다.
    expect(contrast(color.accentFill, color.bg)).toBeGreaterThan(
      contrast(color.fill, color.bg)
    );
    // 그 위의 글자는 읽혀야 한다.
    expect(contrast(color.accent, color.accentFill)).toBeGreaterThanOrEqual(3.0);
  });

  it("전부 상자로 만들지 않는다 — 그러면 위계가 사라진다", () => {
    expect(TONE_SURFACE.primary.backgroundColor).toBe(color.accent);
    expect(TONE_SURFACE.secondary.backgroundColor).toBe(color.accentFill);
    // 덜 중요한 행동과 해제는 면이 없다.
    expect(TONE_SURFACE.text.backgroundColor).toBeUndefined();
    expect(TONE_SURFACE.quiet.backgroundColor).toBeUndefined();
    // 회색 테두리를 두르지 않는다.
    for (const t of ["primary", "secondary", "text", "quiet"] as const) {
      expect(TONE_SURFACE[t].borderWidth).toBeUndefined();
    }
  });

  it("text 는 누를 수 있다는 것이 보이게 강조색을 쓴다", async () => {
    await render(<Button label="이의제기" tone="text" onPress={() => {}} />);
    // 전에는 primary 가 아닐 때 color: undefined 를 명시적으로 넘겨서
    // kind 가 정한 색을 지워버렸다. 글자색이 통째로 날아갔다.
    expect(labelStyle("이의제기").color).toBe("#2B6CF6");
  });

  it("행동 버튼과 해제 버튼은 다른 색을 쓴다", () => {
    // 전에는 둘 다 tone="text" 였고 회색 글자라, 이의제기 같은 실제
    // 행동과 그냥 닫기가 똑같이 생겼다.
    expect(TONE_LABEL.text).toBe("accent");
    expect(TONE_LABEL.quiet).toBe("muted");
  });

  it("quiet 은 그냥 나가는 버튼이라 눈에 덜 띈다", async () => {
    // 전에는 둘 다 회색이라, 실제로 뭔가 하는 버튼과 그냥 닫는 버튼이
    // 똑같이 생겼다.
    await render(<Button label="닫기" tone="quiet" onPress={() => {}} />);
    expect(labelStyle("닫기").color).toBe("#8B95A1");
  });
});

describe("누름 반응의 결", () => {
  it("크기만이 아니라 색도 바뀐다", async () => {
    // 크기만 변하면 "눌렀다"는 느낌이 약하다. 고빈도 상호작용이라
    // 색 전환은 150ms 이내여야 굼떠 보이지 않는다.
    const { motion } = require("../src/design/motion");
    expect(motion.pressFade.duration).toBeLessThanOrEqual(150);
    expect(motion.pressScale).toBe(0.96);   // 0.95 아래는 과장돼 보인다
  });

  it("비활성은 투명도가 아니라 고유한 면으로 말한다", async () => {
    // 흐린 것과 "안 눌리는 것"은 다른 뜻이고, 흐린 라벨은 읽기도 어렵다.
    await render(<Button label="결제하고 시작" disabled onPress={() => {}} />);
    const label = screen.getByText("결제하고 시작");
    const flat = (() => {
      const out: Record<string, unknown> = {};
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object")
          for (const k of Object.keys(v)) out[k] = (v as Record<string, unknown>)[k];
      };
      walk(label.props.style);
      return out;
    })();
    expect(flat.color).toBe(color.textMuted);
  });
});

describe("챌린지의 어두운 면", () => {
  const contrast = (a: string, b: string) => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const lin = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it("어두운 면 위의 글자가 읽힌다", () => {
    // 밝은 면용 강조색(#2B6CF6)은 어두운 면에서 대비 3.61 이라 본문으로
    // 안 읽힌다. 그래서 밝은 변형을 따로 둔다.
    expect(contrast(color.accent, color.ink)).toBeLessThan(4.5);
    expect(contrast(color.inkAccent, color.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.inkText, color.ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.inkMuted, color.ink)).toBeGreaterThanOrEqual(4.5);
  });

  it("어두운 면은 새 색 계열이 아니라 본문 색을 뒤집어 쓴다", () => {
    // 두 번째 강조색을 만들면 파랑이 뜻하는 "되찾은 돈"이 흐려진다.
    expect(color.ink).toBe(color.text);
  });

  it("어두운 면 위 버튼이 밝은 면 색을 그대로 쓰지 않는다", async () => {
    await render(<Button label="크레딧으로 참가" tone="secondary" onDark onPress={() => {}} />);
    const style = screen.getByText("크레딧으로 참가").props.style;
    const out: Record<string, unknown> = {};
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const k of Object.keys(v)) out[k] = (v as Record<string, unknown>)[k];
    };
    walk(style);
    expect(out.color).toBe(color.inkAccent);
  });
});
