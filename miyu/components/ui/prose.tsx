import { lineGroups } from "@/lib/report/reading/line-breaks";

/**
 * 본문 글 — 저장된 글은 그대로 두고, 문장 단위로 블록을 나눈다 (`lib/report/reading/line-breaks.ts`, 운영자 가독성 지시 2026-10-19).
 * 기본은 한 문장이 한 블록이고, 이웃한 두 문장이 모두 짧을 때만 한 블록으로 묶는다(한 블록에 문장 최대 둘). 블록 사이에 작은 여백이 있어 문단이 덩어리로 보이지 않는다.
 * 따옴표 · 괄호 안은 나누지 않고 숫자의 점은 문장 끝으로 보지 않는다. 한 문단(<p>) 안에서 블록만 나뉘므로 읽는 순서 · 글자는 같다.
 */
export function Prose({ text, className, as: Tag = "p" }: { text: string; className?: string; as?: "p" | "span" | "div" }) {
  const lines = lineGroups(text);
  return (
    <Tag className={`${className ?? ""} text-pretty`.trim()}>
      {lines.length <= 1
        ? (lines[0] ?? "")
        : lines.map((line, i) => (
            <span key={i} className={i > 0 ? "mt-1.5 block" : "block"}>
              {line}
            </span>
          ))}
    </Tag>
  );
}
