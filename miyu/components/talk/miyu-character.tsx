import { CHARACTER_IMAGE, CHEEKS, FACE, NOTEBOOK, PEBBLE_BODY, type MiyuMood } from "./miyu-shape";

type Props = {
  /** 크기와 모양을 정하는 클래스 (예: "size-10") */
  className?: string;
  mood?: MiyuMood;
  /** 눈을 가끔 깜빡인다 (모션을 줄이는 설정이면 멈춘다) */
  blink?: boolean;
  /** 생각 중일 때 살짝 흔들린다 */
  bob?: boolean;
  /** 작은 노트 소품 — 작은 크기에서는 보이지 않게 둔다 */
  notebook?: boolean;
};

/**
 * 안내 캐릭터 "미유" — 작은 둥근 조약돌. 장식이라 보조기기에는 숨긴다(이름은 옆의 글자가 말한다).
 * 그림 파일을 바꾸려면 miyu-shape.ts의 CHARACTER_IMAGE만 고치면 된다.
 */
export function MiyuAvatar({ className = "size-10", mood = "smile", blink = false, bob = false, notebook = false }: Props) {
  const face = FACE[mood];
  return (
    <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center ${bob ? "motion-safe:animate-miyu-bob" : ""} ${className}`}>
      {CHARACTER_IMAGE ? (
        <span className="size-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${CHARACTER_IMAGE})` }} />
      ) : (
        <svg viewBox="0 0 48 48" className="size-full overflow-visible">
          <path d={PEBBLE_BODY} fill="var(--color-pebble)" stroke="var(--color-pebble-edge)" strokeWidth="1.3" />
          {CHEEKS.map((c) => (
            <ellipse key={c.cx} cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill="var(--color-pebble-point)" opacity="0.8" />
          ))}
          <g className={blink ? "origin-center [transform-box:fill-box] motion-safe:animate-miyu-blink" : ""}>
            {face.eyes.map(([x, y]) => (
              <circle key={x} cx={x} cy={y} r={face.eyeR} fill="var(--color-ink)" />
            ))}
          </g>
          <path d={face.mouth} fill="none" stroke="var(--color-ink)" strokeWidth="1.7" strokeLinecap="round" />
          {notebook && (
            <g transform={`rotate(${NOTEBOOK.rotate} ${NOTEBOOK.pivotX} ${NOTEBOOK.pivotY})`}>
              <rect x={NOTEBOOK.x} y={NOTEBOOK.y} width={NOTEBOOK.w} height={NOTEBOOK.h} rx={NOTEBOOK.r} fill="var(--color-pebble-point)" stroke="var(--color-accent)" strokeWidth="1.2" />
              {NOTEBOOK.lines.map((d) => (
                <path key={d} d={d} stroke="var(--color-accent-strong)" strokeWidth="1.1" strokeLinecap="round" />
              ))}
            </g>
          )}
        </svg>
      )}
    </span>
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
