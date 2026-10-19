// "홈 화면에 추가" 안내 규칙 — 어떤 환경에서 무엇을 안내하는지만 정한다 (화면은 components/site/home-screen-tip.tsx).
// 브라우저가 허용하지 않는 설치 자동화 · 강제 팝업은 하지 않는다. 안내는 접어 둔 글 한 곳뿐이고, 이미 홈 화면에서 연 화면(standalone)에는 보이지 않는다.
// 사용자 에이전트(UA) 문자열로 어림하는 것이라 틀릴 수 있다 — 실제 iPhone · Android 기기 확인 전에는 "맞게 보인다"고 말하지 않는다.

export type HomeScreenEnv =
  /** iPhone · iPad의 Safari */
  | "ios-safari"
  /** iPhone · iPad의 다른 브라우저(Chrome · Edge · Firefox 등) */
  | "ios-browser"
  /** Android의 Chrome */
  | "android-chrome"
  /** Android의 삼성 인터넷 · 그 밖의 브라우저 */
  | "android-browser"
  /** 카카오톡 · 인스타그램 · 네이버 앱 같은 앱 안의 브라우저 — 홈 화면에 추가할 수 없다 */
  | "in-app"
  /** 데스크톱 · 알 수 없는 환경 — 안내하지 않는다 */
  | "other";

export type HomeScreenGuide = {
  title: string;
  steps: string[];
  note?: string;
};

const IN_APP = /KAKAOTALK|FBAN|FBAV|FB_IAB|Instagram|NAVER\(inapp|Line\/|DaumApps/i;

/** 환경을 어림한다. iPadOS의 "데스크톱 사이트" 모드는 Macintosh로 보여서 터치 지점 수로 가른다. */
export function detectHomeScreenEnv(input: { userAgent: string; maxTouchPoints?: number }): HomeScreenEnv {
  const ua = input.userAgent ?? "";
  const touch = input.maxTouchPoints ?? 0;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1);
  const android = /Android/.test(ua);
  if (!ios && !android) return "other";
  if (IN_APP.test(ua)) return "in-app";
  if (ios) {
    // iOS의 Chrome · Edge · Firefox · Opera · 네이버 웨일은 UA에 CriOS · EdgiOS · FxiOS · OPiOS가 들어간다
    return /CriOS|EdgiOS|FxiOS|OPiOS|OPT\/|GSA\//.test(ua) ? "ios-browser" : "ios-safari";
  }
  // Android의 Chrome은 "Chrome/"이 들어가고 삼성 인터넷 · Edge · Opera · Firefox는 따로 표시가 있다
  if (/SamsungBrowser|EdgA|OPR\/|Firefox|DuckDuckGo|Whale/.test(ua)) return "android-browser";
  return /Chrome\//.test(ua) ? "android-chrome" : "android-browser";
}

const GUIDES: Record<Exclude<HomeScreenEnv, "other">, HomeScreenGuide> = {
  "ios-safari": {
    title: "아이폰에서 홈 화면에 추가하기",
    steps: ["Safari 아래쪽의 공유 버튼(네모에서 화살표가 위로 나가는 모양)을 눌러요.", "메뉴에서 ‘홈 화면에 추가’를 골라요. 목록 아래쪽에 있을 수 있어요.", "오른쪽 위의 ‘추가’를 누르면 홈 화면에 미유 아이콘이 생겨요."],
    note: "홈 화면의 아이콘으로 열면 주소창 없이 앱처럼 보여요. 로그인은 Safari와 따로 한 번 더 해야 할 수 있어요.",
  },
  "ios-browser": {
    title: "아이폰에서 홈 화면에 추가하기",
    steps: ["이 브라우저의 공유 버튼에서 ‘홈 화면에 추가’를 찾아요.", "메뉴에 없으면 Safari에서 같은 주소를 열어 공유 버튼의 ‘홈 화면에 추가’를 눌러요."],
    note: "홈 화면의 아이콘으로 열면 주소창 없이 앱처럼 보여요.",
  },
  "android-chrome": {
    title: "안드로이드에서 홈 화면에 추가하기",
    steps: ["Chrome 오른쪽 위의 ⋮ 메뉴를 눌러요.", "‘홈 화면에 추가’ 또는 ‘앱 설치’를 골라요.", "나타나는 안내에서 ‘추가’(또는 ‘설치’)를 누르면 홈 화면에 미유 아이콘이 생겨요."],
    note: "메뉴 이름은 기기와 Chrome 버전에 따라 조금 달라요.",
  },
  "android-browser": {
    title: "안드로이드에서 홈 화면에 추가하기",
    steps: ["브라우저 메뉴(⋮ 또는 ≡)에서 ‘홈 화면에 추가’ 또는 ‘현재 페이지 추가’를 찾아요.", "메뉴에 없으면 Chrome에서 같은 주소를 열어 ⋮ 메뉴의 ‘홈 화면에 추가’를 눌러요."],
  },
  "in-app": {
    title: "홈 화면에 추가하려면 브라우저로 열어 주세요",
    steps: ["카카오톡 같은 앱 안의 화면에서는 홈 화면에 추가할 수 없어요.", "메뉴(⋮ 또는 공유 버튼)에서 ‘다른 브라우저로 열기’를 눌러 아이폰은 Safari, 안드로이드는 Chrome에서 열어 주세요."],
  },
};

/** 보여 줄 안내. 이미 홈 화면에서 연 화면(installed)이거나 안내할 수 없는 환경이면 null. */
export function homeScreenGuide(env: HomeScreenEnv, installed: boolean): HomeScreenGuide | null {
  if (installed || env === "other") return null;
  return GUIDES[env];
}
