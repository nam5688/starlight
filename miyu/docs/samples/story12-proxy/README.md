# 12개 고정 섹션 비교 시험 — 대리 작성기 글 4편 (2026-10-17)

**실제 서비스 AI의 글이 아니다.** 같은 계열 모델(AI 하위 작업자, "대리 작성기")이 같은 날 같은 입력(가상 인물 P01 · P03, 고민 없음)으로 **구조만 달리해 한 번씩** 쓴 글이다. 고쳐 쓰기 없음 · 제품 검사로 걸러 내지 않은 첫 글이며, 유료 AI 호출 0회.
리포트 예시로 쓰지 않고 고객에게 보이지 않는다. 비교 결과와 한계는 `docs/story-12-sections-review.md` 3장 · `docs/story-12-sections-measure.md` 6장.

| 파일 | 구조 | 지시문 |
| --- | --- | --- |
| `P01-v1.json` · `P03-v1.json` | 지금 story-v1 (영역 셋 + 시기 + 행동) | `story-v1-prompt-0.3` (`lib/report/reading/story-prompt.ts`) |
| `P01-s12.json` · `P03-s12.json` | 12개 고정 장 | `story12-experiment-0.1` (`lib/report/reading/story12-prompt.ts`, **이 검토를 위해 쓴 비교용이며 실제 AI에 보낸 적 없다**) |

같은 지시문 · 자료를 다시 만들려면(호출 없음): `node scripts/measure-story12.ts --inputs <폴더>` — 폴더마다 `instructions.txt`(작성 지시문 + 자료)가 생긴다. 지표는 `node scripts/measure-story12.ts --write`.

**한계**: 표본은 인물 2 × 구조 2 × 1건이고, 12개 장 지시문은 작성자(검토자)가 쓴 것이라 편향이 있을 수 있으며, 같은 계열 모델의 글이다. 지표는 낱말 · 토막을 센 어림이다.
