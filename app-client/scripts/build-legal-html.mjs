// 약관·개인정보처리방침·지원 페이지를 정적 HTML 로 만든다.
//
// 본문은 src/legal/content.ts 한 곳에만 둔다. 웹에 따로 복사해두면 앱과
// 갈라지고, 약관이 갈라지는 것은 곧 허위 고지다. 그래서 복사 대신 생성한다.
// 생성물이 낡았는지는 테스트가 잡는다(__tests__/legal-html.test.ts).

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
// 기본 출력 경로는 커밋되는 자리. 테스트는 임시 디렉터리를 넘겨서
// 작업 트리를 건드리지 않고 비교만 한다.
const outDir = process.argv[2] ?? join(root, "..", "server", "web");

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** [입력 필요] 는 눈에 띄게 남긴다 — 조용히 넘어가면 그대로 공개된다. */
function line(text, needsInput) {
  if (!text.includes(needsInput)) return `<p>${esc(text)}</p>`;
  const [before, after] = text.split(needsInput);
  return `<p>${esc(before)}<mark>${esc(needsInput)}</mark>${esc(after)}</p>`;
}

const CSS = `
:root { color-scheme: light dark;
  --bg:#fff; --fg:#191F28; --sub:#4E5968; --muted:#66707D;
  --line:#E5E8EB; --accent:#1B4FBF; --warn-bg:#FEECEE; --warn-fg:#CC2B3A; }
@media (prefers-color-scheme: dark) { :root {
  --bg:#191F28; --fg:#fff; --sub:#B0B8C1; --muted:#8B95A1;
  --line:#242B36; --accent:#6BA1FF; --warn-bg:#3A1F24; --warn-fg:#FF8A93; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg);
  font-family:'Pretendard','Apple SD Gothic Neo','Noto Sans KR',system-ui,sans-serif;
  line-height:1.7; word-break:keep-all; }
main { max-width:42rem; margin:0 auto; padding:2.5rem 1.25rem 5rem; }
h1 { font-size:1.6rem; letter-spacing:-0.03em; margin:0 0 .5rem; }
h2 { font-size:1.05rem; letter-spacing:-0.02em; margin:2.5rem 0 .75rem;
  padding-top:1.5rem; border-top:1px solid var(--line); }
h2:first-of-type { border-top:0; padding-top:0; }
p { margin:.6rem 0; color:var(--sub); }
mark { background:var(--warn-bg); color:var(--warn-fg); padding:0 .2em; border-radius:3px; }
.warn { background:var(--warn-bg); color:var(--warn-fg);
  padding:.9rem 1rem; border-radius:12px; margin:1.5rem 0; font-size:.9rem; }
nav { margin-bottom:2.5rem; font-size:.9rem; }
nav a { color:var(--accent); text-decoration:none; margin-right:1rem; }
nav a:hover { text-decoration:underline; }
footer { margin-top:4rem; padding-top:1.5rem; border-top:1px solid var(--line);
  color:var(--muted); font-size:.85rem; }
footer a { color:var(--accent); }
`.trim();

const NAV = `<nav><a href="/">스터디로그</a><a href="/support">지원</a>` +
  `<a href="/terms">이용약관</a><a href="/privacy">개인정보처리방침</a></nav>`;

function page(title, sections, needsInput) {
  const incomplete = sections.some((s) => s.body.some((b) => b.includes(needsInput)));
  const body = sections.map((s) =>
    `<h2>${esc(s.heading)}</h2>\n` + s.body.map((b) => line(b, needsInput)).join("\n")
  ).join("\n\n");
  return `<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · 스터디로그</title>
<style>${CSS}</style>
<main>
${NAV}
<h1>${esc(title)}</h1>
${incomplete ? '<p class="warn">아직 작성 중인 문서입니다. 표시된 항목은 출시 전에 채웁니다.</p>' : ""}
${body}
<footer><p>스터디로그 · <a href="/">처음으로</a></p></footer>
</main>
`;
}

const INDEX = `<!doctype html>
<html lang="ko">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>스터디로그</title>
<style>${CSS}</style>
<main>
<h1>스터디로그</h1>
<p>돈을 걸고 공부를 인증하는 습관 앱. 목표를 채운 날마다 건 돈을 크레딧으로 돌려받습니다.</p>
<h2>문서</h2>
<p><a href="/support">지원 · 자주 묻는 질문</a></p>
<p><a href="/terms">이용약관</a></p>
<p><a href="/privacy">개인정보처리방침</a></p>
</main>
`;

// content.ts 를 그대로 읽는다. Node 24 가 타입을 벗겨준다 — 빌드 단계가
// 없으니 생성물이 원본과 어긋날 여지도 없다.
const { TERMS, PRIVACY, SUPPORT, NEEDS_INPUT } =
  await import(join(root, "src", "legal", "content.ts"));

mkdirSync(outDir, { recursive: true });
const files = {
  "index.html": INDEX,
  "terms.html": page("이용약관", TERMS, NEEDS_INPUT),
  "privacy.html": page("개인정보처리방침", PRIVACY, NEEDS_INPUT),
  "support.html": page("지원", SUPPORT, NEEDS_INPUT),
};
for (const [name, html] of Object.entries(files)) {
  writeFileSync(join(outDir, name), html);
  console.log(`  ${name}  ${html.length.toLocaleString()} bytes`);
}

const blanks = [...TERMS, ...PRIVACY, ...SUPPORT]
  .flatMap((s) => s.body).filter((b) => b.includes(NEEDS_INPUT));
if (blanks.length) {
  console.warn(`\n⚠️  아직 ${NEEDS_INPUT} 가 ${blanks.length}곳 남아 있다. 공개 전에 채울 것.`);
}
