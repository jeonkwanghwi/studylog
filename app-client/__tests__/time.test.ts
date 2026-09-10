import {
  elapsedMinutes,
  formatElapsed,
  remainingBeforeForfeit,
} from "../src/time/elapsed";
import { studyDayOf } from "../src/time/studyDay";

const started = "2026-09-10T01:00:00Z";

describe("경과 시간", () => {
  it("서버 시각과 현재 시각의 차이를 분으로 준다", () => {
    expect(elapsedMinutes(started, new Date("2026-09-10T02:35:40Z"))).toBe(95);
  });

  it("초는 버린다", () => {
    expect(elapsedMinutes(started, new Date("2026-09-10T01:00:59Z"))).toBe(0);
  });

  it("기기 시계가 과거로 조작돼도 음수를 내지 않는다", () => {
    expect(elapsedMinutes(started, new Date("2026-09-09T20:00:00Z"))).toBe(0);
  });

  it("사람이 읽는 형태로 포맷한다", () => {
    expect(formatElapsed(0)).toBe("0분");
    expect(formatElapsed(59)).toBe("59분");
    expect(formatElapsed(60)).toBe("1시간");
    expect(formatElapsed(95)).toBe("1시간 35분");
  });

  it("회수까지 남은 시간을 준다", () => {
    // 상한 240분. 시작 후 215분이면 25분 남는다.
    expect(
      remainingBeforeForfeit(started, new Date("2026-09-10T04:35:00Z"))
    ).toBe(25);
  });

  it("이미 상한을 넘겼으면 0을 준다", () => {
    expect(
      remainingBeforeForfeit(started, new Date("2026-09-10T06:00:00Z"))
    ).toBe(0);
  });
});

describe("하루 경계", () => {
  it("KST 03:59 는 전날에 속한다", () => {
    // 2026-09-09 18:59Z == 2026-09-10 03:59 KST
    expect(studyDayOf(new Date("2026-09-09T18:59:00Z"))).toBe("2026-09-09");
  });

  it("KST 04:00 부터 새 하루다", () => {
    expect(studyDayOf(new Date("2026-09-09T19:00:00Z"))).toBe("2026-09-10");
  });

  it("한낮은 그날에 속한다", () => {
    expect(studyDayOf(new Date("2026-09-10T05:00:00Z"))).toBe("2026-09-10");
  });
});
