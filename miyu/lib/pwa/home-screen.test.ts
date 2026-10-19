// "홈 화면에 추가" 안내 규칙 시험 — 환경 어림 · 이미 홈 화면에서 연 화면에는 안내하지 않음 · 안내 문구의 약속
// (UA 문자열로 어림한 것이다. 실제 iPhone · Android 기기에서 어떻게 보이는지는 이 시험이 보증하지 않는다.)
import assert from "node:assert/strict";
import { test } from "node:test";
import { detectHomeScreenEnv, homeScreenGuide, type HomeScreenEnv } from "./home-screen.ts";

const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  iphoneKakao: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 11.2.0",
  iphoneInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 15; SM-F971B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.102 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 15; SM-F971B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
  androidKakao: "Mozilla/5.0 (Linux; Android 15; SM-F971B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2511000",
  androidNaverInApp: "Mozilla/5.0 (Linux; Android 15; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.0.0)",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
};

test("환경 어림: iPhone Safari · iPhone 다른 브라우저 · Android Chrome · 삼성 인터넷 · 앱 안 브라우저 · 데스크톱", () => {
  const cases: [string, HomeScreenEnv, number?][] = [
    [UA.iphoneSafari, "ios-safari"],
    [UA.iphoneChrome, "ios-browser"],
    [UA.iphoneKakao, "in-app"],
    [UA.iphoneInstagram, "in-app"],
    [UA.androidChrome, "android-chrome"],
    [UA.androidSamsung, "android-browser"],
    [UA.androidKakao, "in-app"],
    [UA.androidNaverInApp, "in-app"],
    [UA.desktopChrome, "other"],
  ];
  for (const [ua, expected, touch] of cases) assert.equal(detectHomeScreenEnv({ userAgent: ua, maxTouchPoints: touch }), expected, ua.slice(0, 60));
});

test("iPad의 '데스크톱 사이트' 모드는 터치 지점이 있을 때만 iOS로 본다 (데스크톱 Safari와 구분)", () => {
  assert.equal(detectHomeScreenEnv({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 5 }), "ios-safari");
  assert.equal(detectHomeScreenEnv({ userAgent: UA.ipadDesktopMode, maxTouchPoints: 0 }), "other");
});

test("이미 홈 화면에서 연 화면(standalone)에는 어떤 환경에서도 안내하지 않는다 — 중복 안내 없음", () => {
  for (const env of ["ios-safari", "ios-browser", "android-chrome", "android-browser", "in-app", "other"] as HomeScreenEnv[]) {
    assert.equal(homeScreenGuide(env, true), null, env);
  }
});

test("안내할 수 없는 환경(데스크톱 · 알 수 없음)에는 안내하지 않고, 나머지는 환경에 맞는 단계를 준다", () => {
  assert.equal(homeScreenGuide("other", false), null);
  const ios = homeScreenGuide("ios-safari", false)!;
  assert.match(ios.title, /아이폰/);
  assert.ok(ios.steps.some((s) => /공유/.test(s)) && ios.steps.some((s) => /홈 화면에 추가/.test(s)));
  const android = homeScreenGuide("android-chrome", false)!;
  assert.match(android.title, /안드로이드/);
  assert.ok(android.steps.some((s) => /⋮/.test(s)) && android.steps.some((s) => /홈 화면에 추가|앱 설치/.test(s)));
  const inApp = homeScreenGuide("in-app", false)!;
  assert.ok(inApp.steps.some((s) => /다른 브라우저로 열기/.test(s)), "앱 안 브라우저에서는 홈 화면 추가가 안 된다고 알리고 다른 브라우저로 열게 한다");
});

test("안내 문구는 해요체이고 자동 설치 · 강제 · 보장을 말하지 않는다", () => {
  for (const env of ["ios-safari", "ios-browser", "android-chrome", "android-browser", "in-app"] as HomeScreenEnv[]) {
    const guide = homeScreenGuide(env, false)!;
    const text = [guide.title, ...guide.steps, guide.note ?? ""].join(" ");
    assert.doesNotMatch(text, /합니다|습니다/, `${env}: 해요체`);
    assert.doesNotMatch(text, /자동으로 설치|반드시|꼭 설치|지금 설치하세요/, `${env}: 강제 · 자동 설치 표현 없음`);
  }
});
