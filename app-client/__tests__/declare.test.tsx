import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import Declare from "../app/declare";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
}));

afterEach(() => jest.clearAllMocks());

describe("활동 선언", () => {
  it("선언이 비어 있으면 카메라로 넘어가지 않는다", async () => {
    await render(<Declare />);
    await fireEvent.press(screen.getByText("카메라 열기"));
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("적은 내용을 다듬어 카메라로 넘긴다", async () => {
    await render(<Declare />);
    await fireEvent.changeText(screen.getByPlaceholderText(/수학 문제집/), "  러닝머신 30분  ");
    await fireEvent.press(screen.getByText("카메라 열기"));

    expect(router.replace).toHaveBeenCalledWith({
      pathname: "/capture",
      params: { kind: "start", activity: "러닝머신 30분" },
    });
  });

  it("추천을 누르면 그대로 선언이 된다", async () => {
    await render(<Declare />);
    await fireEvent.press(screen.getByText("운동"));
    await fireEvent.press(screen.getByText("카메라 열기"));

    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({ params: { kind: "start", activity: "운동" } })
    );
  });
});
