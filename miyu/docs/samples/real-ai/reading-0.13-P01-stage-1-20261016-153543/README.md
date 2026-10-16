# 실제 서비스 AI의 첫 글 — 지시문 0.13 · 가상 인물 P01 (2026-10-16)

**이것은 검사를 통과한 리포트가 아니다.** 운영자가 자기 PC에서 직접 입력해 실제 Claude(`claude-sonnet-5-5`)로 만든 글이 **형식 검사를 두 번 모두 통과하지 못해** 저장되지 못한 기록이다. 리포트 예시로 쓰지 않으며 고객에게 보이지 않는다.

| 파일 | 내용 |
| --- | --- |
| `failed/P01-X-round2.json` | **실제 AI 원문**(두 번째 응답의 글, JSON). 바꾸지 않는다 — `real-ai-0.13.test.ts`가 해시로 확인한다. 첫 응답의 글은 보관하지 않았다 |
| `original.md` | 같은 원문을 읽는 순서로 풀어 쓴 것(글자는 그대로, 칸 이름만 붙임) |
| `reviewed/P01-X-round2.reviewed.json` · `reviewed.md` | **검토 후 수정본** — AI(Claude Code)가 원문을 편집했고 **사람 검토 전**이다. 실제 모델이 새로 생성해 통과한 글이 아니다 |
| `reviewed/CHANGES.md` | 원문 → 수정본에서 달라진 48칸 전부의 원문과 수정 |
| `input-evidence.txt` | 이 글을 쓸 때 건넨 근거 41개(가상 인물 자료, 같은 코드 · 기준 월 2026-10으로 다시 만든 목록) |
| `provenance.json` | 모델 · 지시문 · 호출 · 재작성 · 토큰 · 비용 · 당시 검사 버전 · 원문 해시 · 수정본 표시 |
| `cost-and-checks.json` | 운영자 PC 실행의 비용 · 토큰 · 두 응답이 검사에 걸린 이유(글 내용 없음) |

- 가상 인물 P01의 자료이며 실제 고객 정보 · API 키 · 승인 값은 들어 있지 않다.
- 분석(걸린 이유의 분류 · 검사를 고친 내용 · 근거 범위를 넘은 네 곳 · 반복 줄이기 · 말할 수 있는 것과 없는 것)은 `miyu/docs/prompt-pack-review.md` 12장.
- 같은 검사로 다시 보기(새 호출 없음): `node scripts/review-saved-draft.ts docs/samples/real-ai/reading-0.13-P01-stage-1-20261016-153543/reviewed/P01-X-round2.reviewed.json`
- 글은 한 건이고 지시문 효과를 가를 수 없다. 글을 읽은 평가는 같은 계열 모델(Claude)이 가리지 않고 한 것이며 사람의 평가가 아니다.
