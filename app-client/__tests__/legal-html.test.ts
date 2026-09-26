import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * 웹에 올라가는 약관 HTML 이 src/legal/content.ts 와 같은 내용인지 본다.
 *
 * 약관 본문이 두 곳에 있으면 반드시 갈라지고, 갈라진 약관은 허위 고지다.
 * 그래서 웹 페이지는 content.ts 에서 생성하는데 — 생성물을 커밋해두는 이상
 * 누군가 content.ts 만 고치고 재생성을 잊는 일이 생긴다. 눈으로는 절대
 * 안 보이는 종류의 어긋남이라 여기서 잡는다.
 *
 * 고치는 법: npm run build:legal
 */
const WEB_DIR = join(__dirname, "..", "..", "server", "web");

describe("약관 웹페이지", () => {
  it("생성물이 content.ts 와 일치한다", () => {
    // 임시 디렉터리에 새로 만들어 비교한다. 커밋된 파일을 덮어쓰면 실패한
    // 테스트가 스스로 증거를 지워서, 다시 돌리면 통과해버린다.
    const tmp = mkdtempSync(join(tmpdir(), "legal-check-"));
    try {
      execFileSync("node", [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        join(__dirname, "..", "scripts", "build-legal-html.mjs"),
        tmp,
      ], { stdio: "pipe" });

      const read = (dir: string) => Object.fromEntries(
        readdirSync(dir).map((f) => [f, readFileSync(join(dir, f), "utf8")])
      );
      expect(read(WEB_DIR)).toEqual(read(tmp));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("앱스토어가 요구하는 페이지가 전부 있다", () => {
    // Support URL 과 Privacy Policy URL 은 심사 제출에 필수다.
    const files = readdirSync(WEB_DIR);
    for (const f of ["index.html", "terms.html", "privacy.html", "support.html"]) {
      expect(files).toContain(f);
    }
  });

  it("본문이 HTML 로 깨지지 않는다", () => {
    // 약관에 <, & 가 섞이면 페이지가 조용히 망가진다.
    const privacy = readFileSync(join(WEB_DIR, "privacy.html"), "utf8");
    expect(privacy).toContain("개인정보의 국외 이전");
    expect(privacy).toContain("OpenAI");
    expect(privacy).not.toMatch(/<script/i);
  });
});
