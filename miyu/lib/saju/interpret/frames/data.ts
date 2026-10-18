// 프레임이 쓰는 데이터와 확보 상태 — "기존 엔진에서 실제로 계산되는가"(engine)와 "AI에게 근거로 건네지는가"(ai)를 따로 적는다.
// engine: ✔ 만세력 엔진 · 해석 구조 계층이 이미 계산 / △ 계산은 하지만 이 프레임이 쓰는 모양으로 한 번 더 모음 / ✘ 계산 없음
// ai: ✔ 지금 AI 근거 목록에 있음 / △ 일부만 있음 / ✘ 근거 목록에 없음(프레임 어댑터 `cardsToEvidence`를 연결해야 건네진다)
// 새 명리 계산 규칙은 만들지 않았다 — 아래는 모두 이미 계산된 값을 프레임 재료로 모은 것이다.
export type Mark = "✔" | "△" | "✘";

export type DataNote = { label: string; engine: Mark; ai: Mark; note: string };

export const DATA_NOTES: Record<string, DataNote> = {
  gender: { label: "성별(입력)", engine: "✔", ai: "△", note: "대운 계산과 배우자 별(남 재성 · 여 관성)에 이미 쓰인다. AI 근거에는 배우자 별 자리 수(saju.partner)로만 반영되고 성별 자체는 건네지 않는다. 없으면 배우자 별 프레임 · 대운 프레임은 발동하지 않는다." },
  "star-stem": { label: "배우자 별이 천간에 드러남", engine: "✔", ai: "△", note: "원국 십성 계산(structure.ts)으로 센다. AI 근거에는 배우자 별 자리 수만 있고 천간 · 지지 · 지장간 중 어디인지는 구분해 건네지 않는다." },
  "star-branch": { label: "배우자 별이 지지 본기 · 지장간에 있음", engine: "✔", ai: "△", note: "지장간 표(위키백과 대조) 기반. AI 근거 saju.structure.hidden에 지장간과 십신은 있으나 배우자 별 기준으로 모아 건네지 않는다." },
  "day-rel": { label: "일지와 다른 기둥 지지의 합 · 충 · 형", engine: "✔", ai: "△", note: "branchRelations(육합 · 반합 · 충 · 형)로 계산한다. 원진 · 파 · 해는 계산하지 않는다. AI 근거에는 원국 관계 요약이 있으나 일지 기준으로 정리해 건네지는 않는다." },
  "group-count": { label: "십성 그룹별 자리 수(비겁 · 식상 · 재성 · 관성 · 인성)", engine: "✔", ai: "✔", note: "천간(일간 제외) + 지지 본기에서 센 자리 수. saju.sipsung 근거와 같은 기준이다. 지장간까지 센 개수는 있음 · 없음 판단에만 쓴다." },
  "god-count": { label: "십성 이름별 자리 수(정관 · 편관 · 상관 · 겁재 등)", engine: "✔", ai: "△", note: "정 · 편을 가르는 프레임(L4 · L5)이 쓴다. AI 근거는 그룹 단위가 중심이고 이름별 개수는 일부만 있다." },
  "month-ling": { label: "월령(월지 정기의 그룹) · 득령 · 투간", engine: "✔", ai: "✔", note: "saju.structure.month · roots 근거와 같은 계산. 월주가 절기 경계에 걸리면 uncertain으로 두고 프레임에서도 뺀다." },
  strength: { label: "일간 방향(받는 쪽 · 덜 받는 쪽 · 갈림)", engine: "✔", ai: "✔", note: "강약 후보. 점수가 아니라 월령 · 뿌리 · 세력 세 요소의 방향 기록이다(신강 · 신약 판정이 아니다). saju.structure.strength 근거와 같다." },
  roots: { label: "일간의 뿌리(통근)", engine: "✔", ai: "✔", note: "saju.structure.roots 근거와 같은 계산. 전문가 검토 전 초안 기준이다." },
  "luck-current": { label: "현재 대운 · 다음 대운", engine: "✔", ai: "✔", note: "AI 근거에 현재 · 다음 대운이 있다. 대운이 바뀌는 달은 시각 미상이면 정확하지 않아 연 단위 무렵으로만 말한다." },
  "luck-past": { label: "지난 대운(간지 · 시작 · 끝 · 나이)", engine: "✔", ai: "△", note: "엔진은 대운 전체 목록을 계산한다. 2026-10-18부터 프레임이 고른 지난 대운(연애 · 재물 · 과거 회고 몇 개와 지난 대운 개요)을 period와 만 나이 범위(ageWindows)와 함께 AI 근거로 건넨다 — 전체 목록을 건네지는 않는다." },
  "year-current": { label: "올해부터 3년의 세운", engine: "✔", ai: "✔", note: "AI 근거에 올해부터 3년이 있다." },
  "year-past": { label: "지난 세운(만 8세 이후)", engine: "✔", ai: "△", note: "세운 간지는 연도로 계산한다(yearly.ts). 프레임이 고른 지난 세운만 연도 · 만 나이 범위와 함께 AI 근거로 건넨다 — 모든 해를 건네지는 않는다." },
  "luck-rel": { label: "대운 · 세운 지지 × 원국 지지의 합 · 충 · 형", engine: "△", ai: "△", note: "관계 계산(branchRelations)은 있지만 시기별로 원국에 대어 보는 모음은 이 프레임 계층이 처음 만든다(새 규칙이 아니라 기존 함수 재사용)." },
  "luck-god": { label: "대운 · 세운의 천간 · 지지 십성", engine: "✔", ai: "△", note: "일간 기준 십성(getTenGod · getBranchTenGod). AI 근거의 현재 · 다음 대운에는 있고 지난 시기는 없다." },
  uncertain: { label: "흔들리는 기둥(절기 경계 · 야자시 관법)", engine: "✔", ai: "△", note: "엔진 notes에서 읽는다. 그 기둥에 기대는 근거는 프레임에서 뺀다. AI 근거에는 uncertain 표시로 일부만 전달된다." },
  "hour-unknown": { label: "출생 시각 미상(시주 없음)", engine: "✔", ai: "✔", note: "세 기둥으로만 계산하고 시주를 쓰지 않는다. 시각 미상이면 대운 전환은 연 단위 무렵으로만 말한다." },
  age: { label: "만 나이(출생 연-월과 기준 연-월)", engine: "△", ai: "✔", note: "출생 연-월과 시기의 연-월로 센다. 생일의 일은 따지지 않아 한 살 안쪽의 어림이 남는다 — 그래서 모든 시기는 '만 N세 무렵'으로만 말하고, AI 근거에는 ageWindows(범위)로 건넨다." },
  survey: { label: "설문 응답(뚜렷한 방향만)", engine: "✔", ai: "✔", note: "survey.<축>.<high|low> 근거에서 읽는다. 프레임이 있고 없음에는 쓰지 않고 앞세울 얼굴과 일치 · 차이 표시에만 쓴다." },
};

export const DATA_KEYS = Object.keys(DATA_NOTES);
