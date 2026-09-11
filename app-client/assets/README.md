# 앱 아이콘·스플래시

디자인이 나오기 전까지는 `npx create-expo-app` 이 만든 기본 리소스를 그대로 쓴다.
아래는 실제 디자인이 나왔을 때 교체해야 할 파일과 규격이다 (`app.json` 이
참조하는 이름 기준).

| 파일 | 용도 | 규격 |
|---|---|---|
| `icon.png` | iOS 앱 아이콘 (`expo.icon`) | 1024×1024, 정사각형, 알파 없음 |
| `android-icon-foreground.png` | 안드로이드 적응형 아이콘 전경 (`expo.android.adaptiveIcon.foregroundImage`) | 1024×1024, 중앙 66% 안전영역에 그림 배치 |
| `android-icon-background.png` | 안드로이드 적응형 아이콘 배경 (`expo.android.adaptiveIcon.backgroundImage`) | 1024×1024 |
| `android-icon-monochrome.png` | 안드로이드 13+ 단색(테마) 아이콘 (`expo.android.adaptiveIcon.monochromeImage`) | 1024×1024, 실루엣만 |
| `splash-icon.png` | 스플래시 화면에 쓸 로고 (현재 `app.json`에 미연결) | 1024×1024 |

**참고**: 이 프로젝트는 Expo SDK 57 템플릿이 만든 3분할 적응형 아이콘
(`foreground`/`background`/`monochrome`) 방식을 쓴다. 구버전 문서에 나오는
단일 `adaptive-icon.png` + `backgroundColor` 방식은 여기 해당하지 않는다.
스플래시 화면은 `expo-splash-screen` 플러그인이 아직 설정되지 않아 시스템
기본값을 쓰며, `splash-icon.png`는 지금은 참조되지 않는 파일이다. 커스텀
스플래시가 필요해지면 `expo-splash-screen`을 설치하고 `app.json`의
`plugins`에 아이콘 경로를 지정해야 한다.
