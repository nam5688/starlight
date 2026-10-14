import { MIYU_IMAGES, type MiyuMood } from "./miyu-moods";

type Props = {
  /** 크기를 정하는 클래스 (예: "size-10") */
  className?: string;
  mood?: MiyuMood;
  /** 생각 중일 때 살짝 흔들린다 (모션을 줄이는 설정이면 멈춘다) */
  bob?: boolean;
};

/**
 * 안내 캐릭터 "미유" — 운영자가 보낸 그림 그대로의 표정(miyu-moods.ts). 장식이라 보조기기에는 숨긴다(이름은 옆의 글자가 말한다).
 * 둥근 모서리의 정사각형 프로필로 보이고, 표정은 말하는 상황마다 다르다.
 */
export function MiyuAvatar({ className = "size-10", mood = "basic", bob = false }: Props) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-[26%] bg-page bg-cover bg-center ${bob ? "motion-safe:animate-miyu-bob" : ""} ${className}`}
      style={{ backgroundImage: `url(${MIYU_IMAGES[mood]})` }}
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
