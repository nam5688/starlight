import { MIYU_IMAGES, type MiyuMood, type MiyuTone } from "./miyu-moods";

type Props = {
  /** 크기를 정하는 클래스 (예: "size-10") */
  className?: string;
  /** 캐릭터 색 — 상담 주제마다 다르다(기본은 대표 연두). 핑크(love)는 연애 · 결혼 · 궁합 영역에서만 쓴다 */
  tone?: MiyuTone;
  /** 말하는 상황 — 지금 그림은 색마다 하나뿐이라 그림을 바꾸지 않는다(표정 그림이 더 오면 쓴다) */
  mood?: MiyuMood;
  /** 생각 중일 때 살짝 흔들린다 (모션을 줄이는 설정이면 멈춘다) */
  bob?: boolean;
};

/**
 * 안내 캐릭터 "미유" — 운영자가 보낸 그림 그대로(miyu-moods.ts), 상담 주제마다 색만 다르다. 장식이라 보조기기에는 숨긴다(이름은 옆의 글자가 말한다).
 * 그림의 바탕이 흰색이라 둥근 모서리의 흰 정사각형 프로필로 보인다(아이보리 화면 위에서는 은은하게 떠 보이고, 흰 말풍선 곁에서는 자연스럽게 이어진다).
 */
export function MiyuAvatar({ className = "size-10", tone = "main", bob = false }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-[26%] bg-canvas bg-cover bg-center ${bob ? "motion-safe:animate-miyu-bob" : ""} ${className}`}
      style={{ backgroundImage: `url(${MIYU_IMAGES[tone]})` }}
    />
  );
}

/**
 * 미유가 답을 쓰는 중이라는 표시 — 점 세 개가 차례로 튄다.
 * AI가 답을 만드는 동안(오래 걸릴 수 있다)에도 같은 표시를 쓴다. 모션을 줄이는 설정이면 움직이지 않고 점만 보인다.
 */
export function TypingDots({ className = "size-2" }: { className?: string }) {
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`${className} rounded-full bg-accent motion-safe:animate-miyu-dot`} style={{ animationDelay: `${i * 170}ms` }} />
      ))}
    </span>
  );
}
