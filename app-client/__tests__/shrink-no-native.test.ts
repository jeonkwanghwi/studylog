/**
 * 네이티브 모듈이 아예 없는 빌드.
 *
 * shrink.test.ts 와 파일을 나눈 이유: 그쪽 맨 위의 jest.mock 은 호이스팅돼
 * 파일 전체에 걸리므로, 같은 파일 안에서 "모듈이 없는" 상황을 만들 수 없다.
 */

jest.mock("expo-image-manipulator", () => {
  throw new Error("ExpoImageManipulator 네이티브 모듈이 없습니다");
});

describe("네이티브 모듈이 없을 때", () => {
  it("모듈을 읽다 던져도 앱이 죽지 않고 원본으로 올린다", async () => {
    // 정적 import 였다면 이 예외가 shrink.ts 를 읽는 순간, 즉 try 바깥에서
    // 터진다. 그러면 카메라 화면이 통째로 죽는다 — 사진을 못 줄이는 것과
    // 앱이 죽는 것은 전혀 다른 일이다. 그래서 호출 시점에 불러온다.
    const { shrinkForUpload } = require("../src/api/shrink");
    expect(await shrinkForUpload("file:///cache/original.jpg"))
      .toBe("file:///cache/original.jpg");
  });
});
