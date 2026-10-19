/**
 * 열었다고 한 확인창이 실제로 눈에 보이고 누를 수 있는 곳에 있는지 확인한다.
 * 실기기 보고(2026-10-19): "삭제" 버튼을 누르면 어두운 배경만 생기고 확인창이 보이지 않아 삭제할 수 없었다.
 * 브라우저마다 맨 앞 레이어(<dialog>의 top layer)를 그리는 방식이 달라, 화면 밖에 놓이거나 높이가 0이 되어도 배경만은 그려진다.
 * 그런 브라우저에서 사용자가 막다른 곳에 갇히지 않도록, 연 직후 이 확인으로 보이지 않는다고 판단되면 같은 내용을 카드 안(일반 문서 흐름)에 펼쳐 보인다.
 *
 * 보이는 조건: ① 숨겨지지 않았고(display · visibility · opacity) ② 어느 정도 크기가 있고 ③ 제목이 화면 안에 있으며
 * ④ 제목 자리를 실제로 누르면 이 창 안의 것이 눌린다(다른 것이 덮거나 잘라 내지 않았다).
 * 판단이 틀려 멀쩡한 창을 "안 보인다"고 하면 같은 내용이 카드 안에 열릴 뿐 삭제 확인은 똑같이 거친다.
 */
export function isVisiblyRendered(panel: HTMLElement | null, title: HTMLElement | null): boolean {
  if (!panel || !title) return false;
  const style = window.getComputedStyle(panel);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
  const box = panel.getBoundingClientRect();
  if (box.width < 160 || box.height < 120) return false;
  const t = title.getBoundingClientRect();
  if (t.width < 1 || t.height < 1) return false;
  const x = t.left + t.width / 2;
  const y = t.top + Math.min(t.height / 2, 10);
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const hit = document.elementFromPoint(x, y);
  return !!hit && panel.contains(hit);
}
