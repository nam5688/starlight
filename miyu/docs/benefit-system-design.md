# 통합 혜택 · 보상 시스템 설계 (쿠폰 · 미유 포인트 · 질문권 · 친구추천 · 누적 적립 · 리뷰)

> **설계 문서다. 구현하지 않았고 운영 DB에 아무것도 적용하지 않았다.** 코드 변경은 순수 계산 모듈(`lib/commerce/profit.ts` · `tax.ts`, 시험 포함)뿐이고 화면 · DB 마이그레이션 · 서버 동작은 그대로다.
> 운영자 지시(2026-10-17)의 개발 순서 1~5단계(조사 → 정책 차이 → 데이터 모델 → 손익 모델 · 지표 → 관리자 설정 · 조회 화면)만 이 문서와 `docs/profit-model.md` · `docs/profit-scenarios.md` · `docs/tax-review-checklist.md`에 담았다.
> 6~10단계(마이그레이션 · 서버 · 화면 · 연결 · 시험 · 운영 적용)는 이 설계를 운영자가 본 뒤에 한다. **실제 포인트 · 쿠폰 지급, 실결제, 유료 AI 호출, 공개 배포, 사업자등록, 운영 DB 적용은 하지 않았고 별도 승인 없이 하지 않는다.**
> 기존 v1 개발(개인 리포트 · 명리 엔진 · 무료 궁합 · 유료 사주 궁합 · 리포트 궁합 · 질문권 · 결제 · 개인정보 정책)은 바꾸지 않았다.

---

## 0. 한 장 요약

| 구분 | 내용 |
| --- | --- |
| **최신 확정 정책** | ① 친구 첫 구매 가격 **6,900원**(정가 9,900원, 기존 5,900원 대체) ② 추천 인원 **무제한** ③ 추천 가입 1명당 추천인에게 **500P — 가입 즉시가 아니라 검증 뒤 확정** ④ 추천받은 친구가 첫 심층 리포트를 정상 구매하면 **추천인 · 구매자 각각 질문권 1개(총 2개)** ⑤ 리뷰 1건당 질문권 1개 ⑥ 구매 포인트 적립 3 · 5 · 7 · 10%(누적 구간, 10~30만 구간은 기본 3%) ⑦ 포인트는 무상 발급 · 현금 충전 · 환급 · 양도 없음 · 전액 교환만(혼합 결제 없음) ⑧ 쿠폰 5종 ⑨ 질문권 장부 3종(기본 무료 · 프로모션 · 유료) 사용 순서 기본 → 만료 빠른 프로모션 → 유료 |
| **재사용 가능** | 질문 묶음 장부(DB 13 · 16)와 부분 환불 · 무료 질문 한도의 DB 보장(16) · 초대 링크 토큰 규칙과 "첫 구매 1회" 판정(18) · 주문 · 결제 대조 · 환불 반영 · AI 사용 기록(17) · 관리자 화면 틀 · 사업 지표 집계(metrics-service) |
| **새로 만들어야 함** | 포인트 장부(로트 · 만료 · 회수) · 무상 질문권 장부(종류 · 만료) · 쿠폰 · **0원 혜택 주문 경로** · 추천 가입 추적(대기 → 확정) · 리뷰와 보상 · 누적 구매 등급 · 설정과 변경 이력 · 비용 입력(광고비 · 고정비) · 세금 모델 화면 · 새 측정 이벤트 |
| **기존 정책과 충돌해 고칠 것** | 5,900원 · 3명 제한 · 보상 1개(추천인만) · "할인 확인이 오류이면 정가 주문으로 이어 간다" · "결제 상태의 기준은 결제사 기록뿐"(0원 주문 예외 필요) · 주문 금액 0 불가(DB) · 초대 링크 자격(심층 구매자만) — 3장 |
| **손익 검증 결과(가정 기준)** | 모든 값이 **가정**이라 구조 확인용이다. 추천 묶음은 가입 → 첫 구매 전환율이 약 2.7%를 넘어야 남는다(포인트 전부 사용 · 전부 잠식 시 8.1%, AI 재작성 · 무료 상담 많음 시 12.7%). 감면 0%에서도 기본 가정은 이익이 난다. 상세 `docs/profit-scenarios.md` |
| **운영자 확인이 필요한 새 항목(6건)** | 7장 |

---

## 1. 조사 결과 — 지금 있는 것 (코드 · DB 직접 확인, 2026-10-17)

### 1-1. 주문 · 결제

- `orders`(DB 1): `amount integer not null check (amount > 0)` — **0원 주문을 만들 수 없다.** 상태 `pending · paid · failed · canceled · refunded`, 상태 전이는 `orders_guard` 트리거가 지킨다, 금액 · 소유자는 만든 뒤 바꿀 수 없다. 같은 (검사 결과, 상품)에 결제 완료 하나 · 대기 하나(고유 인덱스). `payment_key`(결제사 키) · `method` · `provider = 'tosspayments'` 기본.
- 구매 권한의 기준은 `orders.status = 'paid'`다. 리포트(`reports.order_id`)는 주문에 **외래 키 · 고유 제약**으로 묶여 있어 리포트가 있으려면 주문 행이 있어야 한다. 그래서 0원 혜택 구매도 주문 행이 필요하다(5장).
- 결제 대조(`reconcile-service`) · 웹훅 · 환불 반영은 결제사 기록만 기준이다. 주문을 손으로 "결제 완료"로 바꾸는 기능은 없다(운영 원칙).
- 상품 번호: `personal-integrated-report`(첫 구매) · `:r<번째>`(다시 받기) · `concern-report:<기록>`(숨김) · `cash-charge:<단위>:<보너스>:<번호>`(질문 묶음, 3개 = 9단위).

### 1-2. 질문 · 질문권

- 방마다 무료 질문(`CHAT_ROOMS`): 무료 리포트 회원은 연애 2 · 고민 2 · 오늘 1(하루) · 나를 알아보기 0, 심층 리포트 회원은 방마다 3. **무료 질문 수는 DB가 지킨다**(`reserve_chat_question` → 확정 / 해제, DB 16).
- 유료 질문: 질문 3개 묶음 2,500원. DB 13 지갑(`cash_wallets` 잔액 · `cash_ledger` 거래: `charge · bonus · spend · spend_restore · clawback`)을 "결제한 질문 장부"로 쓰고(질문 1개 = 3단위), **DB 16 `question_packs`**가 묶음(주문)별 산 질문 · 쓴 질문 · 환불한 질문 · 누적 환불액을 가진다. 사용 · 되돌림은 `spend_cash` · `restore_cash_spend`(같은 참조번호로 한 번), 환불 · 부분 환불은 `apply_cash_refund`.
- 질문 처리 흐름(`chat-service.ts`): ① 소유자 · 방 확인 → ② `reserveChatQuestion`(무료) → 한도 초과면 ③ `spendCash`(유료) → AI 답 → 성공하면 확정, 실패하면 무료는 해제 · 유료는 `restoreCashSpend`. **여기에 "프로모션 질문권" 한 단계를 끼워 넣는 자리가 있다(무료 뒤, 유료 앞).**
- 15번 `admin_credit_question`: 결제사 확인 뒤 질문 수동 반영(주문당 한 번).
- **없는 것**: 만료 · 종류(프로모션 · 리뷰 · 추천) 구분이 있는 무상 질문권 장부.

### 1-3. 초대 (DB 18 · 구현됨 · 운영 DB 적용은 운영자 확인 전)

- `invites`(결과마다 링크 하나, `inviter_tier` = deep | free), `invite_discounts`(초대받은 회원 한 줄 · 주문 한 건, 본인 초대 불가), 함수 `invite_discount_status` · `claim_invite_discount(token, invitee, order, cap)`.
- 판정(DB): 없는 링크 · 할인 대상 링크 아님 · 본인 · **초대한 사람의 구매 확인(`inviter-not-paid`)** · 이미 사용 · 첫 구매 아님 · **한도(`cap`) 초과**. 한도는 앱이 인자로 넘긴다(`INVITE_DISCOUNT.maxPerInviter = 3`).
- 앱: `INVITE_DISCOUNT.priceKrw = 5900`, `maxPerInviter = 3`(`lib/config/product.ts`), `order-service.startCheckout`이 `inviteToken`을 받아 할인 주문을 만들고 **확정에 실패하면 정가 주문으로 이어 간다**(에러여도 막지 않음), 쿠키 `miyu_invite`(30일), 화면 `/invite/<토큰>` · `invite-section.tsx`.
- 보상(질문권 · 포인트)은 **없다.** 가입 추적(누가 어느 링크로 가입했는가)도 없다 — 할인을 받은 사람만 기록된다.

### 1-4. AI 사용 기록 · 비용

- `ai_usage`(DB 17): `report_id · provider · model · prompt_version · input_tokens · output_tokens · est_cost_krw · latency_ms · outcome(ok|invalid|timeout|error) · error_code`, 쌓기만 한다(update 금지 트리거). 리포트 · 채팅 · 맛보기가 같은 표를 쓴다(채팅 · 맛보기는 `report_id = null`).
- **없는 열**: 호출이 **어느 상담방 · 어떤 질문 종류(무료/프로모션/유료) · 어느 회원(구매) · 몇 번째 시도**인지. 그래서 "질문 1회당 원가", "상담방별 원가", "질문권 종류별 AI 원가", "구매 한 건에 연결된 무료 질문 비용"은 **지금 집계할 수 없다**(10장).
- `est_cost_krw`는 단가가 설정돼 있을 때만 채워진다(`AI_PRICE_*` 또는 공식 가격표 × 환율).

### 1-5. 관리자 · 지표

- `/admin`: 처리 필요 요약 · 배포 정보 · 용량(생성 중 · 대기 · 하루 AI 예산) · 주문 찾기 · 최근 주문 30건 · 결제 대기 · 리포트 생성 문제 · 운영 기록. 질문 수동 반영 버튼 · 결제사 대조 버튼. **수익 · 비용 · 세금 · 혜택 화면은 없다.**
- `/admin/metrics`(`metrics-service.getMetrics`): 방문 단계(`funnel_events`: `visit · analyze_start · analyze_complete · preview_view · report_view`만 허용) · 서버 기록 단계 · 매출(실결제만, 환불 차감, 테스트 제외) · 채널별 · 만족도 · AI 비용(실결제 리포트의 호출만) · 재구매. **"순이익은 결제 수수료 · 세금을 빼지 않은 단순 계산이다(AI 비용만 뺀다)"**(코드 주석).
- 광고비 · 서버비 · 임대료 · 수수료율 · 과세 유형 · 다른 소득을 **입력하는 곳이 없다.**

### 1-6. 재사용 판정 표

| 필요한 것 | 기존 | 판정 |
| --- | --- | --- |
| 결제 승인 · 환불 · 웹훅 중복 · 부분 환불 | orders · payment_events · reconcile · apply_cash_refund | **그대로 재사용** |
| 유료 질문 장부 · 묶음별 환불 | cash_ledger · question_packs | **그대로 재사용**(유료 질문권 = 이 장부) |
| 무료 질문 한도 · 동시성 | reserve_chat_question | **그대로 재사용**(기본 무료 = 이 경로) |
| 중복 지급 방지 방식 | cash_ledger의 `(order_id, kind)` · `(ref, kind)` 고유 인덱스 | **같은 방식으로 새 장부에 적용** |
| 추천 링크 토큰 | invites(24자 무작위) · `createInviteToken` | **토큰 규칙 재사용**, 표는 새로(결과 단위 → 회원 단위) |
| 첫 구매 1회 판정 | invite_discount_status의 `not-first` · `already-used` | **논리 재사용**, 함수는 새 마이그레이션에 새로 |
| AI 비용 기록 | ai_usage · estimateCostKrw | **재사용 + 열 추가**(10장) |
| 관리자 틀 · 접근 제어 | `ADMIN_USER_IDS` · /admin 페이지들 · 운영 기록 | **재사용**, 화면 추가 |
| 지표 집계 틀 | metrics-service · listOrdersForMetrics | **재사용 + 확장** |
| 개인정보 가리기 | `lib/personalization` 가림 규칙 | **리뷰 본문에 재사용** |
| 포인트 · 쿠폰 · 추천 가입 · 리뷰 · 등급 · 설정 이력 · 비용 입력 | 없음 | **새로** |
| 0원 주문 | 없음(DB가 막는다) | **새로 + DB 제약 완화 1건**(5장) |

---

## 2. 최신 정책 (이 문서의 기준 — 운영자 2026-10-17)

> 아래가 정책의 **유일한 최신 기준**이다. 문서 · 주석 · 코드에 5,900원 · 3명 제한 · 보상 1개만 같은 옛 규칙이 남아 있으면 이 표가 우선한다(3장에 남은 곳 목록).

| # | 정책 | 값 · 규칙 |
| --- | --- | --- |
| P1 | 친구 첫 구매 가격 | **6,900원** (정가 9,900원). 해당 회원의 첫 적격 구매 1회만. 다른 정액 · 정률 쿠폰과 **자동 중복 적용하지 않음**. 할인 자격 · 최종 금액은 서버가 결정 |
| P2 | 추천 인원 | **제한 없음**. 추천 링크 생성 수도 제한 없음. 다만 부정 가입에 따른 보상 지급까지 무제한 보장하지는 않는다 |
| P3 | 추천 가입 보상 | 신규 가입 1명당 추천인에게 **500P**. 동일 신규 회원의 추천인은 한 명만. 자기 추천 불가. 동일 가입에 중복 지급 불가. **가입 즉시 확정하지 않고 검증 뒤 확정**(대기 → 확정 / 의심은 관리자 확인) |
| P4 | 친구 첫 구매 보상 | 추천받은 신규 회원이 첫 심층 리포트를 정상 구매하면 **추천인 질문권 1개 + 구매한 회원 질문권 1개(총 2개)**. 결제 완료와 권한 지급이 확인된 뒤 확정, 주문당 각각 한 번. 환불 시 미사용 질문권 회수, 이미 쓴 것은 음수를 만들지 않고 별도 정산 상태 |
| P5 | 리뷰 보상 | 정상 이용한 유료 상품 **구매 건당 1회** 질문권 1개. 긍정 · 부정 동일. 수정 · 삭제 · 재작성으로 중복 지급 없음. 체험단 무상 상품 리뷰의 지급 여부는 관리자 정책 |
| P6 | 구매 적립 | 누적 유효 현금 결제 10만원 미만 3% · (10~30만원 미만 **미정 — 기본 3% 유지, 설정에서 변경**) · 30만원 이상 5% · 70만원 이상 7% · 100만원 이상 10%. 환불 · 취소 제외, 등급 도달 **다음 구매부터**, 소급 없음, **포인트 구매는 누적액에 불포함, 포인트 전액 교환 주문에는 적립 없음**, 중복 승인 · 웹훅 재전송에도 한 번만, 환불 시 누적 · 적립 조정 |
| P7 | 미유 포인트(MP) | 무상 발급 보상 수단. 현금 충전 · 환급 · 양도 없음, 현금 환급가치 보장 없음. 발급 · 사용 · 회수 · 만료 이력. 이용자 화면에 원화 적립금처럼 표시하지 않음. 상품 교환가 ≈ 현금가 × 1.2(9,900원 → **11,900P**), **상품별로 서버에 명시 저장**(표시 계산에 의존하지 않음). **전액 교환만**, 현금 · 포인트 혼합 없음. 기존 구매 리포트의 MY 다시보기는 계속 무료(재분석 상품과 구분) |
| P8 | 질문권 장부 | 기본 무료 · 프로모션 · 리뷰 · 추천 · 첫 구매 보상 · 유료 구매를 구분. **사용 순서: 기본 무료 → 만료가 빠른 프로모션 · 리뷰 · 추천 보상 → 유료.** 보상 질문권은 기존 질문권이 남아 있어도 추가 지급. 생성 성공 시 차감 · 실패 시 복원 · 동시 중복 차감 방지. 프로모션 기본 유효기간 **지급 후 1년**(정책별 변경 가능). **무상 질문권이 남았다는 이유로 탈퇴를 제한하지 않음**. 유료 질문권의 사용기간 · 환불은 별도 정책 |
| P9 | 쿠폰 | 정액 · 정률 · 상품 100% · 무료 리포트 이용권 · 질문권 지급. 관리자 설정(이름 · 코드 · 설명 · 대상 상품 · 대상 회원 · 계정별 횟수 · 전체 한도 · 기간 · 중복 가능 여부 · 활성 · 중단 · 회수 · 이력). 100%는 **PG 결제 없이 서버가 검증한 무료 주문 경로**, 결제 완료를 위조하지 않음 |
| P10 | 세금 · 손익 | 별도 개인사업자(송도 · 영종 후보), 청년창업 감면 **0 · 50 · 75% 시나리오(75%는 확정 아님)**, 일반 · 간이 과세, 다른 소득 합산, 확정액과 추정액 구분(`docs/profit-model.md`) |
| P11 | 운영자 조절 | 적립률 · 혜택 · 등급 기준 · 교환가 · 유효기간을 켜고 끄고 바꿀 수 있어야 하고 변경 이력을 남긴다 |

---

## 3. 최신 정책 ↔ 기존 코드 · 문서의 차이 (충돌 목록)

| # | 충돌 | 지금 | 해야 할 일 | 단계 |
| --- | --- | --- | --- | --- |
| C1 | 초대 가격 5,900 → 6,900 | `INVITE_DISCOUNT.priceKrw = 5900`, DB 18 주석 · 함수 설명, `order-service` 주문 금액, `invite-section.tsx` · `/invite/<토큰>` 화면 문구, `setup-checks.ts`, `check-invites.sql`, `db.test.ts` · `invite-service.test.ts` | 설정값 한 곳 + 새 함수 + 문구 · 시험 갱신. **DB 18은 수정하지 않는다** | 6 |
| C2 | 3명 제한 → 무제한 | `INVITE_DISCOUNT.maxPerInviter = 3`, 함수 인자 `p_cap`, `invite-service`의 "한 사람이 3명까지" · 남은 자리 표시, 시험 "네 번째 사람은 정가" | 새 마이그레이션에서 한도 없는 `claim_referral_discount`. 화면의 남은 자리 · "3명까지" 문구 삭제 | 6 |
| C3 | 초대 링크 자격 | 심층 리포트를 **결제까지 마친** 회원만 링크를 만들 수 있고(`inviter_tier = deep`, `inviter-not-paid`), 링크는 결과(검사) 단위 | 최신 정책에 **명시가 없다**. 설계 기본값: **가입 동의를 마친 모든 회원이 회원 단위 링크 하나**를 갖는다(500P 가입 보상 · 질문권은 구매 확인 뒤). 기존 결과 단위 링크는 읽기 호환만 유지. **→ 운영자 확인(7장 Q1)** | 6 |
| C4 | 보상 | 이전 D13: 추천인에게 질문권 1개(결제 완료 시) | 가입 500P(검증 뒤) + 구매 질문권 **양쪽** 각 1개. "첫 구매 보상 1개만" 규칙 삭제 | 6 |
| C5 | **할인이 안 될 때 정가 주문으로 자동 이어 가기** | CLAUDE.md · `order-service`: "확정에 실패하거나 확인이 오류여도 구매를 막지 않고 정가 주문으로 이어 간다" | **금지로 바꾼다**: 적격이 아니면 사유 + 정가를 보이고 고객이 확인한 뒤 결제, **서버 오류는 할인 불가로 보지 않고 오류를 보이며 다시 시도하게 하고 정가 주문을 자동으로 만들지 않는다** | 6 |
| C6 | 0원 주문 | `orders.amount > 0` 체크, 구매 권한 = `status = 'paid'` + 결제사 기록 | 5장. 제약 완화 1건(`amount > 0 or provider = 'benefit'`)과 혜택 장부가 기준인 새 주문 경로. "결제 상태의 기준은 결제사 기록뿐"을 "**돈이 오가는 주문**은 결제사 기록, **0원 혜택 주문**은 혜택 장부가 기준"으로 고친다 | 6 |
| C7 | 질문권 장부 | 유료 질문 장부 하나(DB 13 · 16) + 무료 한도(DB 16) | 무상 질문권 장부를 **새 표**로 추가하고 기존 두 장부는 그대로 둔다. 사용 순서에 한 단계 삽입 | 6 |
| C8 | 탈퇴 | 남은 **유료** 질문이 탈퇴를 막는 임시 처리(정책안 P4) | 무상 질문권 · 포인트 · 쿠폰은 **탈퇴를 막지 않는다**. 탈퇴 함수(`withdraw_member_data`)에 새 표들의 삭제 · 정리 추가(회원번호 · 거래 이력만 남기는 범위는 별도 결정 — 7장 Q4) | 6 |
| C9 | 화면 문구 | `talk-room.test.ts`: 화면에 "충전" · "캐시"를 쓰지 않는다(예전 선불 캐시 폐기) | 포인트(MP)는 허용하되 "충전" 금지 유지, "미유캐시"와 혼동되지 않게 이름은 **"미유 포인트"**. 이용자에게 원화 환산 표시 금지(교환가는 P 단위만) | 7 |
| C10 | 정가 병기 | "할인 전 가격 · 마감 타이머 금지 — 예외: 초대 링크로 온 실제 할인 대상에게만 정가와 초대 가격 병기" | 쿠폰 · 포인트 교환 화면의 가격 표기 규칙은 새로 정해야 한다. 기본값: 결제 확인 화면에 정가 · 할인 금액 · 최종 금액을 보이되 마감 타이머 · "오늘만" 금지 유지. **→ 운영자 확인(Q5)** | 7 |
| C11 | 문서의 옛 서술 | `CLAUDE.md`("초대 링크 · 초대 할인" 문단 · D13), `docs/v1-scope.md` D13, `docs/compat-proposal.md` 7 · 8장, `docs/launch-checklist.md`, `docs/runbook.md`, `docs/update-guide.md`, `docs/service-v2-proposal.md`, `docs/saju-rules.md` 일부 | 이번 작업에서 `CLAUDE.md` · `v1-scope.md`는 최신 정책으로 고치고, 나머지는 "구현은 옛 정책(5,900원 · 3명) — 6단계에서 교체"로 표시(아래 12장 목록) | 지금 |
| C12 | 매출 · 지표 | `metrics-service`가 모든 주문을 센다(0원 주문이 없어서) | 혜택 주문(provider `benefit`)은 매출 · 결제 수 · 전환 단계에서 제외하고 보상 비용으로 따로 센다 | 6 |
| C13 | 결제 대조 | `reconcile`이 결제 대기 · 승인 주문을 결제사와 맞춘다 | 혜택 주문은 결제사 조회 대상이 아니다(키 없음) — 대조에서 제외 + 혜택 장부와의 대조는 별도(`check-benefits.sql`) | 6 |
| C14 | 측정 이벤트 | `funnel_events.name` check이 5개 값만 허용 | 새 이벤트(추천 링크 방문 · 무료 궁합 시작 · 결과 · 전환 클릭 등)를 위해 허용 값 확장(새 마이그레이션) 또는 서버 기록 표로 대체(10장) | 6 |
| C15 | 약관 · 처리방침 | 초대 · 포인트 · 쿠폰 조건이 없다(초대 할인 조건도 아직 적지 않음) | **법률 검토 대상**(8장). 포인트 · 질문권 · 쿠폰의 유효기간 · 소멸 · 회수 · 서비스 종료 시 처리를 사전 고지 | 10 |

---

## 4. 데이터 모델 (제안 — 새 마이그레이션 5개, 번호 · 이름은 가안)

공통 원칙: ① **기존 마이그레이션(1~18)은 수정하지 않는다** ② 새 표 · 열 · 함수를 **더하기만** 한다(예외 1건: 5장의 `orders` 제약 완화 — 운영자 승인 필요) ③ 거래 장부는 **쌓기만 한다**(update · delete 금지 트리거) ④ 잔액 = 거래의 합이어야 하며 읽기 전용 확인 SQL `supabase/check-benefits.sql`이 대조한다 ⑤ 지급 · 회수 · 차감은 **서버만**(security definer 함수 + 서버 비밀키, 브라우저는 본인 조회만) ⑥ 모든 지급 · 차감에 **멱등 키**(고유 인덱스) ⑦ 회원 단위 잠금 안에서 처리(`pg_advisory_xact_lock(hashtext(user_id))`) ⑧ 이름 · 생년월일 · 상담 내용은 어떤 혜택 표 · 이벤트에도 넣지 않는다.

### 4-1. 설정과 변경 이력 (마이그레이션 19 `benefits_core`)

- `benefit_settings(key text primary key, value jsonb not null, updated_at, updated_by uuid)` — 키 예: `earn.tiers`(구간 경계 · 적립률 표), `point.prices`(상품별 교환가), `referral.invitee_price`, `referral.signup_points`, `referral.hold_hours`, `credit.promo_days`, `review.reward_free_orders`, 켜고 끄는 스위치 `feature.points` · `feature.coupons` · `feature.referral` · `feature.review_reward` ….
- `benefit_settings_history`(쌓기만): `key · old_value · new_value · changed_by · changed_at · reason`. 설정 변경은 함수 `set_benefit_setting(key, value, reason)` 하나로만(이력 자동 기록, 관리자만).
- **지급 시점의 설정을 거래에 박아 둔다**: 거래 행의 `meta`에 적용한 적립률 · 교환가 · 만료일을 적어, 나중에 설정이 바뀌어도 과거 거래가 바뀌지 않는다.

### 4-2. 미유 포인트 (19)

- `point_accounts(user_id pk, balance int check >= 0)` — 거래의 합과 같은 캐시 값.
- `point_lots(id, user_id, amount, remaining, expires_at null, source_kind, source_id, created_at)` — **지급 한 번 = 로트 하나**. 사용은 만료가 빠른 로트부터 차감(FIFO by `expires_at`).
- `point_ledger`(쌓기만): `id · user_id · kind · amount(부호 있음) · lot_id · order_id · ref · idempotency_key unique · shortfall · meta jsonb · created_at`
  - `kind`: `earn_purchase`(구매 적립) · `earn_referral`(추천 가입 500P, **확정 시점에만**) · `earn_admin` · `earn_event` · `earn_coupon` · `spend`(교환) · `spend_restore`(교환 실패 · 취소 복원) · `expire` · `clawback`(환불 · 회수) · `adjust`(운영자 정정, 사유 필수).
  - 멱등: 구매 적립은 `(order_id, 'earn_purchase')` 한 번, 교환은 `(ref, 'spend')` 한 번, 회수는 `(order_id, 'clawback')` 한 번.
- **음수 금지 · 회수 규칙**: 환불로 적립을 회수할 때 이미 쓴 포인트는 되찾지 않고(잔액이 음수가 되지 않게) `shortfall`에 부족분을 기록하고 "정산 필요" 목록에 올린다(관리자가 처리 방법을 정함 — 7장 Q3). 13번 `cash_ledger`의 `clawback` · `shortfall`과 같은 방식이다.
- 만료: 정기 점검(기존 `/api/cron/reconcile` 틀)이 만료된 로트의 `remaining`을 `expire` 거래로 소멸시킨다. 만료일이 없는(무기한) 포인트인지 기본 유효기간이 있는지는 정책 미정 → 설정 `point.expire_days`(기본 비워 둠 = 약관에서 정한 값, **Q2**).

### 4-3. 질문권 — 무상 장부 (19)

- 기존 **그대로**: 기본 무료(`reserve_chat_question` · `chat_questions`) · 유료(`cash_*` · `question_packs`).
- 새로: `credit_lots(id, user_id, kind, quantity, remaining, expires_at, source_kind, source_id, idempotency_key unique, revoked_at, created_at)`
  - `kind`: `promo`(프로모션 · 쿠폰) · `review` · `referral_inviter` · `referral_invitee` · `event` · `admin`.
  - `expires_at` = 지급일 + 설정 일수(기본 365일, 정책별 변경).
- `credit_ledger`(쌓기만): `lot_id · user_id · kind(grant | spend | restore | expire | revoke) · qty · ref · shortfall · created_at`, 멱등 `(ref, kind)`.
- 함수: `spend_credit(user, ref)` → 만료되지 않은 로트 중 **만료가 가장 빠른 것 1개 차감**(없으면 null), `restore_credit_spend(user, ref)`, `grant_credit(...)`, `revoke_credit(order 또는 source)` — 환불 시 `remaining` 만큼 회수, 이미 쓴 만큼은 `shortfall`로 기록(음수 금지).
- **사용 순서(질문 한 번)**: ① 기본 무료(`reserve_chat_question`) ② `spend_credit`(없으면 다음) ③ `spend_cash`(유료). 생성 실패 시 **쓴 쪽을 되돌린다**(참조번호 하나로 어느 장부에서 썼는지 `credit_ledger` · `cash_ledger`가 이미 기록).
- 코드 삽입 자리: `chat-service.ts`의 무료 한도 초과 분기(`spendCash` 앞), `quota.ts`의 `RoomPolicy.cashAllowed` 근처. 질문 한 번이 어느 장부에서 나갔는지는 새로 `chat_questions.credit_kind`(열 추가) 또는 `ai_usage` 열(10장)에 남겨 원가 측정에 쓴다.

### 4-4. 쿠폰과 0원 주문 (마이그레이션 20 `coupons_free_orders`)

- `coupons(id, code unique, name, description, type, value, product_ids text[], target_group, per_user_limit, issue_limit, issued_count, redeemed_count, starts_at, ends_at, stackable_with_invite bool default false, stackable_with_coupon bool default false, status('draft'|'active'|'paused'|'revoked'), created_by, created_at)` — `type`: `amount` · `percent` · `free-product`(상품 100%) · `free-report-entitlement`(무료 리포트 이용권) · `credit`(질문권 지급).
- `coupon_redemptions(id, coupon_id, user_id, order_id null, status('reserved'|'used'|'released'|'revoked'), idempotency_key unique, created_at, updated_at)` — **예약 → 사용 → (실패 시) 해제**. 한도(`per_user_limit` · `issue_limit`)는 쿠폰 행을 잠근 함수 안에서 확인.
- `orders` 확장(열 추가): `list_amount`(정가) · `discount_krw` · `discount_kind`(`referral` · `coupon` · `none`) · `discount_ref` — **가격이 어떻게 정해졌는지 주문에 남겨** 손익 분석(정가/초대/쿠폰 비중)에 쓴다.

### 4-5. 추천 (마이그레이션 21 `referrals`)

- `referral_links(user_id pk, token unique 24자, created_at, deactivated_at)` — 회원 단위 링크 하나(기존 `createInviteToken` 재사용). 기존 `invites` 토큰은 읽기 호환(같은 추천인으로 해석).
- `referral_visits(id, token, anon_id, created_at)` — 방문 측정용. 회원번호 · 이름 · 생년월일 없음, 익명 방문 번호(쿠키)만. 쌓기만, 90일 뒤 정리.
- `referral_signups(invitee_user_id pk, inviter_user_id, link_token, signed_up_at, status('pending'|'confirmed'|'review'|'rejected'|'revoked'), risk jsonb, hold_until, confirmed_at, reward_ledger_id, note)` — **한 신규 회원의 추천인은 한 명**(pk), 자기 추천 불가 체크, 같은 가입에 보상 한 번(`reward_ledger_id` + 포인트 거래 멱등 키 `referral:<invitee>`).
- `referral_first_purchases(invitee_user_id pk, order_id unique, status('pending'|'confirmed'|'revoked'), inviter_lot_id, invitee_lot_id, created_at)` — 첫 구매 보상 두 질문권의 추적.
- 함수: `register_referral_signup(token, invitee, anon_id)`(가입 직후 서버가 호출, 쿠키 토큰 사용) · `referral_discount_status(token, invitee)` · `claim_referral_discount(token, invitee, order)`(한도 없음, 첫 구매 · 본인 · 이미 사용 판정, 주문 금액이 설정 가격과 같은지 확인) · `confirm_referral_signup(invitee)` · `reject_referral_signup(invitee, reason)` · `confirm_referral_purchase(order)`(주문이 `paid`로 바뀌는 같은 트랜잭션 트리거, 5장).

**추천 가입 검증 설계(500P를 가입 즉시 주지 않는다)**

| 단계 | 규칙(기본값은 제안, 설정으로 변경) |
| --- | --- |
| 가입 | `register_referral_signup` → `pending`, 위험 신호 계산(`risk`) |
| 위험 신호 예 | ① 추천인과 같은 익명 방문 번호 · 같은 기기 쿠키 ② 같은 추천 링크에서 짧은 시간(예: 1시간 10명 초과) 대량 가입 ③ 링크 방문 → 가입이 지나치게 빠름(예: 10초 미만) ④ 같은 로그인 수단 · 이메일 도메인의 반복(일회용 메일 도메인 목록은 만들지 않았다 — 운영 중 필요하면 추가) ⑤ 추천인 계정이 가입 직후(예: 1시간 미만) 링크를 퍼뜨림 |
| 자동 확정 조건 | 위험 신호 없음 **그리고** 신규 회원이 **무료 분석을 끝내 결과가 저장**됨(= 실제 이용 증거) **그리고** 보류 시간(`hold_hours`, 기본 72시간) 경과 → 500P 지급(`earn_referral`, 만료는 정책) |
| 의심 | 위험 신호가 있으면 `review` — 자동 지급하지 않고 관리자 큐에 올린다(확정 · 거절 · 사유) |
| 취소 · 회수 | 확정 뒤에도 부정이 확인되면 `revoked` + 포인트 `clawback`(이미 쓴 만큼은 `shortfall`, 음수 금지). 이력 보존 |
| 한도 | 인원 수 제한 없음. 단 **보류 · 의심 건이 쌓이는 비율**을 관리자 화면에 표시해 남용을 본다. 자동화 가입(봇) 방어는 가입 단계의 기존 방어 + 요청 제한 — 이 설계는 기존 방어를 대체하지 않는다 |

### 4-6. 리뷰 (마이그레이션 22 `reviews`)

- 지금 있는 `report_feedback`(리포트당 별점 하나, 다시 누르면 고침)은 **공개 후기가 아니고** 보상과 무관하다. 그대로 두고 새 표를 더한다.
- `reviews(id, order_id unique, user_id, product_id, rating 1~5, body ≤ 500자, visibility('private'|'public'), incentive_disclosed bool default true, moderation_status, created_at, updated_at, deleted_at)`, `review_rewards(order_id pk, credit_lot_id, status, created_at)` — **`order_id`가 기본 키라 구매 건당 보상은 한 번**이고 수정 · 삭제 · 재작성은 보상을 다시 만들지 않는다(삭제해도 행은 남음).
- 대상 주문: 결제 완료(`provider tosspayments`)된 유료 상품. 체험단 · 쿠폰 100% · 포인트 교환 주문은 설정 `review.reward_free_orders`(기본 꺼짐)로만.
- 공개 후기는 "혜택(질문권)을 받고 쓴 후기" 표시를 붙인다(`incentive_disclosed`). 본문에 생년월일 · 연락처 · 상대 정보가 들어가지 않게 입력 안내 + 서버 가림(`lib/personalization` 규칙 재사용).
- 허위 구매 · 중복 계정 · 조작 방지: 리뷰는 **본인 결제 주문**에만 달 수 있고(`orders.user_id` = 작성자), 같은 추천 관계(추천인 ↔ 피추천인)끼리의 리뷰 보상은 관리자 표시, 삭제된 리뷰의 보상은 유지(회수하지 않음) 등은 운영 규칙으로 정한다.

### 4-7. 누적 구매 등급 (19의 설정 + 계산 규칙)

- 별도 등급 표를 만들지 않고 **주문에서 계산**한다: `cumulative(user) = sum(orders.amount) where provider = 'tosspayments' and status = 'paid'`(환불된 주문은 자동 제외, 부분 환불은 환불액 차감), 포인트 구매 · 혜택 주문 제외.
- 적립률은 **그 주문 이전의 누적액**으로 구간을 찾아 정한다(등급 도달 다음 구매부터 · 소급 없음). 적용한 값은 `point_ledger.meta`에 박는다.
- 구간 경계 · 적립률은 `benefit_settings.earn.tiers`(변경 이력 자동). 10~30만원 구간은 설정 기본 3%.
- 환불: 누적액에서 빠지므로 다음 구매의 구간이 자동으로 내려가고, 그 주문의 적립은 `clawback`(이미 쓴 만큼은 `shortfall`).

### 4-8. 비용 · 세금 입력 (마이그레이션 23 `finance_and_ai_context`)

- `cost_entries(id, month date, category('ad'|'server'|'rent'|'tool'|'tax-fee'|'other'), amount_krw, vat_krw, memo, vendor, evidence_ref, created_by, created_at)` — 광고비 · 서버비 · 임대료 등 **운영자가 직접 입력**(영수증 번호만, 파일은 저장하지 않음).
- `finance_settings`(= `benefit_settings` 같은 구조의 별도 키 공간): 과세 유형 · PG 수수료율 · 간이과세 부가가치율 · 감면율 시나리오 · 다른 소득 · 소득공제 · 지방소득세율 · 세율표 — **변경 이력 포함**.
- `tax_records(id, period, kind('vat'|'income'|'local-income'), status('estimate'|'filed'), amount_krw, filed_at, memo)` — **신고 확정액과 관리자 추정액을 구분**한다. 대시보드는 `filed`와 `estimate`를 항상 따로 보인다.
- `ai_usage` 열 추가(`add column`): `purpose`(`report` · `chat` · `taste` · `compat` …) · `room_key` · `credit_kind`(`free` · `promo` · `paid`) · `attempt_no` · `is_retry` · `user_ref`(회원번호가 아니라 **구매 건에 연결하기 위한 주문 id**). 기존 행은 null로 남는다.

---

## 5. 쿠폰 · 포인트 교환 · 0원 주문 경로

### 5-1. 왜 새 경로가 필요한가

0원 주문(상품 100% 쿠폰 · 포인트 전액 교환)은 **결제사를 거치지 않는다.** 그런데 리포트 생성 · 권한은 `orders` 행에 묶여 있다(1-1). "결제 완료를 위조하지 않는다"는 지시를 지키면서 같은 권한 경로를 쓰려면 다음처럼 한다.

1. `orders`에 `provider = 'benefit'`인 주문을 **DB 함수(`grant_benefit_order`, security definer, 서버만 호출)만** 만든다. 함수 한 번의 트랜잭션 안에서 ① 쿠폰 예약 → 사용 또는 포인트 로트 차감을 **먼저 확정**하고 ② 그 근거(`coupon_redemptions` 행 · `point_ledger` 거래)를 가리키는 주문을 `status = 'paid'`, `amount = 0`, `payment_key = null`로 만든다. 근거 없이 0원 주문을 만들 수 없다.
2. 제약 완화: `amount > 0` 체크를 `amount > 0 or provider = 'benefit'`로 바꾼다(새 마이그레이션 · 기존 파일 수정 아님. **더하기만 규칙의 유일한 예외라 운영자 승인이 필요하다 — Q6**). 그 밖의 상태 전이 · 불변 규칙(`orders_guard`)은 그대로다.
3. **화면 · 문서의 표현**: 0원 주문은 "결제 완료"가 아니라 "혜택으로 받음"으로 표시한다(MY · 결제내역). 매출 · 결제 수 · 전환율 · 환불률에는 넣지 않고 보상 비용으로 센다(C12). 결제 대조에서는 제외(C13).
4. 되돌리기: 혜택 주문의 "환불"은 결제사 취소가 아니라 **회수**다 — 쓴 포인트 · 쿠폰을 복원할지(생성 실패) 회수할지(부정 이용)는 `revoke_benefit_order(order, reason)` + 운영 기록으로, 이미 만든 리포트는 지우지 않는다(정책: 서비스 사정 · 부정 이용은 별도 판단 — 7장).
5. 생성 실패: 리포트 생성이 실패하면 **같은 주문 · 같은 리포트 건으로 재시도**한다(포인트를 다시 쓰지 않음, 기존 결제 주문과 같은 방식).

### 5-2. 가격 · 중복 규칙 (결제 시작 때 서버가 한다)

`quoteCheckout(user, assessment, product, options)` 한 곳이 다음을 정한다(화면 · 브라우저가 보낸 금액은 믿지 않는다).

| 단계 | 규칙 |
| --- | --- |
| 1 | 정가(`PERSONAL_REPORT.priceKrw`)와 이 구매의 적격 할인을 모두 계산: ① 추천 첫 구매 6,900원 ② 선택한 쿠폰 ③ (별도 경로) 포인트 전액 교환 |
| 2 | **자동 중복 적용 금지**: 추천 6,900원과 쿠폰이 함께 적격이면 둘 중 고객이 고르게 한다(쿠폰의 `stackable_with_*`가 true일 때만 함께). 서버는 조용히 하나를 고르지 않고 선택지를 돌려준다 |
| 3 | **적격이 아니면**(한도 소진 · 이미 사용 · 첫 구매 아님 · 기간 지남 …) 사유와 정가를 돌려주고 **고객이 금액을 확인한 뒤** 결제를 시작한다(C5) |
| 4 | **서버 오류**는 "할인 불가"가 아니다 — 오류 안내 + 다시 시도, 정가 주문을 자동으로 만들지 않는다 |
| 5 | 최종 금액이 0이면 PG 경로가 아니라 `grant_benefit_order`(5-1)로, 0보다 크면 지금의 `startCheckout` 경로로 간다(주문 금액은 서버가 정한 `amount`) |
| 6 | 결제 대기 주문의 쿠폰 예약은 1시간 뒤 풀린다(기존 초대 할인 대기 규칙과 같다) |

### 5-3. 포인트 교환

- 교환가는 `benefit_settings.point.prices[product_id]`에 **상품별로 명시 저장**한다(예: 심층 리포트 11,900P). 9,900원 × 1.2 = 11,880은 11,900으로 올려 저장한 예시다 — **반올림 규칙은 운영자가 정한 값 그대로 저장**하고 코드는 계산하지 않는다. 6,900원 초대가는 교환가와 무관(교환가는 정가 상품 기준). 궁합 · 질문권 상품은 가격 확정 뒤 같은 방식으로 추가한다.
- 흐름: 교환 요청 → 서버가 교환가 · 잔액(로트 합) 확인 → `grant_benefit_order('point', …)` → 로트 차감(만료가 빠른 것부터) → 혜택 주문 + 리포트 생성. **혼합 결제 없음**(잔액이 모자라면 거절하고 모자라는 포인트만 안내, 현금으로 대신 받지 않는다).
- 포인트 교환 주문에는 구매 적립이 없고(P6) 누적 구매액에 들어가지 않는다.
- **재분석 상품과 MY 다시보기를 구분**한다: 이미 구매한 리포트를 MY에서 다시 보는 것은 계속 무료이고 포인트를 쓰지 않는다. 포인트로 교환하는 것은 새 리포트를 생성하는 상품(다시 받기 `:r<번째>`)이다.

### 5-4. 쿠폰 유형별 처리

| 유형 | 처리 |
| --- | --- |
| 정액 · 정률 | 최종 금액 = max(0, 정가 − 할인). 0이면 5-1 경로, 0 초과면 PG(할인된 금액으로 주문, `discount_*` 열에 기록) |
| 상품 100% · 무료 리포트 이용권 | 5-1 경로(`coupon-full`) |
| 질문권 지급 | 주문 없이 `grant_credit(kind = 'promo' 또는 쿠폰 설정)` — 쿠폰 사용 이력과 질문권 로트가 서로를 가리킴 |
| 공통 | 계정별 횟수 · 전체 한도 · 기간 · 대상 회원 · 대상 상품을 서버(DB)가 확인. 회수(`revoked`)는 미사용분만, 이미 쓴 것은 이력만 남김 |

---

## 6. 손익 · 지표 설계 (요약 — 상세는 `docs/profit-model.md` · `docs/profit-scenarios.md`)

- 계산 순서: 결제금액 → 환불 차감 → 부가세 구분 → PG 수수료 → AI 원가(리포트 · 질문) → 무료 이용 원가 배분 → 보상 비용(구매 적립 · 추천 500P · 질문권 · 리뷰 · 쿠폰) → **공헌이익** → 광고비 → 고정비 → **사업이익** → 소득세 · 지방소득세(다른 소득 합산, 감면 0 · 50 · 75%) → **세후 이익**. 같은 비용을 두 번 빼지 않는다(시험이 확인).
- **포인트 1P를 1원 · 1/1.2원으로 확정 회계 처리하지 않는다.** 기대 비용 = 사용률 × (교환 상품의 실제 제공 원가 + 잠식률 × 잃은 현금 순매출) ÷ 교환 포인트. 상한(전부 사용 · 전부 잠식)과 낮은 사용률을 같은 식에서 입력만 바꿔 본다. 회계 · 세무상 처리는 별도(`docs/tax-review-checklist.md`).
- 측정할 세 가지(운영자 지시의 핵심): ① **추천 가입자가 실제 구매로 이어지는 비율** ② **질문 1회당 실제 AI 원가** ③ **포인트가 추가 현금 매출을 만드는지**.

---

## 7. 운영자 확인이 필요한 새 항목 (이미 정한 것은 다시 묻지 않는다)

> **2026-10-17 운영자가 Q1~Q6을 아래처럼 정했다(이 표의 "설계 기본값"은 설계 당시 제안이고, 확정은 7-1이다).** 7-1의 확정은 개발 · 테스트 환경에 구현했고 운영 DB에는 적용하지 않았다(14장).

### 7-1. 확정(운영자 2026-10-17)

| # | 확정 내용 | 구현에서 지키는 방식 |
| --- | --- | --- |
| Q1 | 추천 링크는 가입한 회원이면 누구나 · 초대 인원 제한 없음. 가입만으로 500P를 주지 않고 ① 계정 확인 ② 무료 분석 1건 완료 ③ 중복 · 부정 검사를 거친 뒤 확정. 이상이면 보류 · 관리자 검토. 추천 가입자별 무료 AI 원가와 구매 전환을 따로 추적 | `register_referral_signup` · `evaluate_referral_signup`(확정 조건 · 위험 신호 · 하루 한도 → `review`) · `admin_decide_referral_signup` · 관리자 추천 탭의 손익분기 경고(자료가 30명 미만이면 판단하지 않음) |
| Q2 | 포인트 유효기간은 지급일부터 1년. MY에서 곧 소멸할 포인트와 날짜를 보여 주고, 관리자가 이벤트별 소멸 기간을 설정 | 포인트 묶음(`point_lots.expires_at`)에 지급 당시 설정이 박힘 · `overview.points.expiringSoon` · 설정 `point.expire_days` · 질문권 `credit.expire_days` |
| Q3 | 환불 · 부정 시 **쓰지 않은** 보상만 회수. 음수 잔액 없음, 다음 지급에서 자동 상계 없음. 회수하지 못한 몫과 주문을 기록 | `clawback_points_by_source` · `revoke_credits_by_source`(`shortfall` 기록) · `revoked_at`으로 회수된 묶음은 되돌려도 살아나지 않음 · 읽기 전용 확인 `supabase/check-benefits.sql` |
| Q4 | 탈퇴 시 남은 무상 혜택 종료, 잔액이 있다는 이유로 탈퇴를 막지 않음(결제한 질문이 남은 경우의 기존 임시 처리는 그대로), 개인정보 · 혜택 정보는 법적 근거에 맞춰 삭제, 법정 보관이 필요한 거래 · 결제 · 환불 · 분쟁 기록은 따로 보관 | `forfeit_member_benefits`(남은 포인트 · 질문권 소멸 · 추천 링크 삭제 · 추천 기록의 익명 번호 · 위험 신호 비움) · 설정 `benefit.withdrawn_ledger_retention_days`(비어 있으면 정리하지 않음 — 법률 검토로 정함) |
| Q5 | 결제 전 정가 · 할인 금액 표시, 서버가 적격을 확인. 적격이 아니면 사유 + 정가를 보이고 고객 확인 필요. **서버 오류는 "할인 불가"가 아니다.** 포인트 교환 가격은 현금과 따로 표시 | `quoteForCheckout` · `planCheckout`(`needs-confirmation` · `needs-choice` · `error`) · `startBenefitCheckoutAction` · 결제 화면(구매 영역) |
| Q6 | 0원 주문은 서버가 승인한 적격 쿠폰 · 혜택만, PG 없이, 유료 주문과 구분. 기존 16 · 18번 마이그레이션은 수정하지 않고 새 마이그레이션이 제약을 바꿈. 개발 · 테스트 환경에서만 승인 | 마이그레이션 20번(`orders_zero_guard` 트리거 · `provider` 불변 · `grant_benefit_order`) · 직접 삽입은 DB가 거절(`supabase/tests/benefits.db.test.ts`) · 결제 대조 · 매출 지표에서 제외 |

추가 지시의 반영: 500P 비용과 무료 AI 원가를 따로 센다(`referralHealth`의 `cost`) · 추천 가입 → 첫 구매 전환이 손익분기보다 낮으면 관리자에게 경고 · 관리자가 적립 · 가입 보상 · 구매 보상 · 후기 보상 · 추천 전체를 설정 하나로 일시 중지(`PAUSABLE_FEATURES`) · 질문 한 번의 AI 원가(평균 · p95 · 재시도 비용) · 75% 감면은 확정되지 않은 조건부 가정이고 기본은 0% · 기존 주문 · 질문권 · 초대 할인 권리는 그대로(예전 초대 링크는 같은 주소에서 계속 동작) · 정가 구매와 추천 구매의 공헌이익을 같은 기준으로 다시 비교(`docs/profit-scenarios.md` 5-1).

### 7-2. 설계 당시 제안(참고, 위 확정이 우선)

| # | 질문 | 설계 기본값 | 왜 묻나 |
| --- | --- | --- | --- |
| Q1 | 추천 링크를 **누가** 만들 수 있나 | 가입 동의를 마친 모든 회원(회원 단위 링크 하나) | 최신 정책에 자격이 없고 기존 코드는 "결제까지 마친 심층 구매자만"이다. 모든 회원으로 열면 500P 남용 면이 커진다(검증으로 막는다) |
| Q2 | 포인트 · 프로모션 질문권 **만료** | 질문권은 지급 후 1년(확정), 포인트는 정책 미정(설정 값 비워 두면 만료 없음) | 포인트 만료를 두면 미사용 잔액 부담이 줄지만 약관 · 이용자 고지가 필요하다 |
| Q3 | 환불로 적립 · 보상을 회수할 때 **이미 쓴** 포인트 · 질문권의 정산 방법 | 음수 없이 `shortfall` 기록 + 관리자 목록. 다음 지급에서 자동 상계하지 않는다 | 자동 상계는 이용자에게 불리해 보일 수 있다 |
| Q4 | 탈퇴 시 혜택 이력의 **보존 범위** | 포인트 · 질문권 · 쿠폰 잔액은 삭제(탈퇴를 막지 않음), 정산 필요 건 · 회원번호 + 거래 이력은 주문처럼 최소 보존 | 법정 보존(전자상거래 · 세법)과 개인정보 최소화의 균형 — 법률 검토 |
| Q5 | 쿠폰 · 교환 화면의 **가격 표기**(정가 병기) | 결제 확인 화면에 정가 · 할인 · 최종 금액 표시, 마감 타이머 · "오늘만" 금지 | 기존 원칙의 병기 예외는 초대 할인뿐이다 |
| Q6 | 0원 주문을 위한 **`orders` 제약 완화 1건**(`amount > 0` → `amount > 0 or provider = 'benefit'`) | 완화하고 혜택 주문은 혜택 장부가 기준 | "더하기만" DB 규칙의 유일한 예외라 승인이 필요하다. 대안은 `reports.order_id` 외래 키까지 손대는 더 큰 변경이다 |

---

## 8. 법률 · 세무 · 정책 검토가 필요한 항목 (확정 아님)

- 미유 포인트가 **선불전자지급수단 · 상품권**에 해당하는지(무상 발행 · 환급 · 양도 · 현금 충전 없음이 설계 전제이나 법적 판단은 하지 않았다), 포인트 · 쿠폰 · 질문권의 **유효기간 · 소멸 · 사용 제한 · 서비스 종료 시 처리**의 약관 고지와 소비자 보호 기준(표준약관 · 상품권 · 포인트 관련 지침).
- 리뷰 보상의 **대가성 표시**(경제적 대가를 받고 쓴 후기 표시 — 표시 · 광고 심사 기준), 허위 · 조작 후기 방지.
- 추천 링크 방문 · 가입 연결 · 위험 신호(익명 방문 번호 · 가입 시각 패턴)가 **개인정보 처리**에 해당하는지, 보유 기간 · 고지(처리방침), 만 14세 미만 제한과 추천 보상.
- 회원 간 보상(추천인 포인트 · 질문권)과 **대가성 · 경품**(경품 · 사행성 관련 규정 해당 여부), 세법상 포인트 · 쿠폰의 부가세 · 소득 인식 시점(`docs/tax-review-checklist.md`).
- 0원 혜택 주문의 **환불 · 청약철회 · 회수** 기준(무상으로 받은 상품).
- 약관 · 처리방침 문구는 출시 전 법률 검토 대상이며 이 문서는 법률 자문이 아니다.

---

## 9. 관리자 설정 · 조회 화면 설계 (구현 전 · 화면 구성 제안)

기존 `/admin`(운영) · `/admin/metrics`(지표)를 유지하고 아래를 **추가**한다. 모두 `ADMIN_USER_IDS`만 열리고, 이름 · 생년월일 · 상담 내용 · 리포트 본문은 보이지 않는다(회원번호 앞 8자 + 닉네임까지만, 기존 규칙).

| 화면 | 구성 |
| --- | --- |
| `/admin/benefits` 혜택 설정 | ① 스위치(포인트 · 쿠폰 · 추천 · 리뷰 보상 켬/끔) ② 누적 적립 구간 표(경계 · 적립률 편집, 10~30만 구간 기본 3% 표시) ③ 포인트 교환가(상품별 P) ④ 추천(친구 첫 구매 가격 · 가입 포인트 · 보류 시간 · 질문권 수) ⑤ 유효기간(질문권 · 포인트) ⑥ **변경 이력 표**(누가 · 언제 · 이전 값 → 새 값 · 사유) |
| `/admin/coupons` 쿠폰 | 목록(상태 · 발행 · 사용 · 한도) · 만들기(이름 · 코드 · 설명 · 대상 상품 · 대상 회원 · 계정별 횟수 · 전체 한도 · 기간 · 중복 가능 여부) · 활성 · 중단 · 회수 · 사용 이력(회원번호 앞 8자 + 주문번호) |
| `/admin/referrals` 추천 | 퍼널(링크 방문 → 가입 → 무료 분석 → 첫 구매 → 환불 → 재구매) · **대기 · 의심 큐**(위험 신호 · 확정 · 거절 · 회수 버튼, 사유 필수) · 보상 비용 합계 · 의심 비율 |
| `/admin/ledgers` 장부 | 포인트(발행 · 사용 · 만료 · 회수 · 잔액 · 정산 필요 건) · 질문권(종류별 발행 · 사용 · 만료) · 장부 일치 확인 결과(`check-benefits.sql`과 같은 대조) |
| `/admin/profit` 수익 | 5개 구역(아래) + **입력 폼**(광고비 · 고정비 · PG 수수료율 · 과세 유형 · 다른 소득 · 소득공제 · 감면율 시나리오) · **0 · 50 · 75% 동시 비교** · "신고 확정액"과 "관리자 추정액" 분리 표시 |

**`/admin/profit` 구역** — 운영자 지시의 구성 그대로: ① 매출(상품별 현금 매출 · 정가/초대 구매 비중 · 환불률 · 추가 질문권 매출) ② 원가(리포트 AI · 질문당 AI · 무료 이용 · PG · 광고 · 고정비) ③ 보상(쿠폰 사용액 · 포인트 발행/사용/미사용 · 질문권 발행/사용/만료 · 추천 가입/구매 보상 비용 · 등급별 이용자 수) ④ 수익(상품별 공헌이익 · 전체 운영이익 · 예상 소득세/지방소득세 · 세후 예상 이익 · 손익분기) ⑤ 전환율(무료 분석 완료율 · 무료 → 심층 결제율 · 무료 궁합 → 사주 궁합 · 사주 궁합 → 리포트 궁합 · 추천 가입 → 첫 구매 · 리포트 읽기 완료율 · 결제 후 질문 사용률 · 포인트 사용 후 재구매율).

**이용자 `MY › 내 혜택`**: ① 미유 포인트(잔액 · 곧 만료되는 포인트 · 사용 · 적립 이력 — 원화 환산 표시 없음) ② 질문권(종류별 남은 수 · 만료일 · 사용 순서 안내) ③ 쿠폰함(사용 가능 · 사용함 · 기간 지남) ④ 친구 추천(내 링크 · 가입 수 · 대기/확정 상태 · 구매 보상 상태 — **다른 사람의 이름 · 결과는 보이지 않는다**) ⑤ 누적 구매 혜택(현재 적립률 · 다음 구간까지 — 불안 · 압박 문구 없이 담담하게) ⑥ 리뷰 쓰기(내 구매 건 · 보상 여부).

---

## 10. 측정 설계 — 새로 수집 vs 기존 DB 집계 (운영자 지시 9 · 10 · 11 · 13)

### 10-1. 추천 가입 → 첫 구매 (지시 9)

| 이벤트 | 어디서 | 상태 |
| --- | --- | --- |
| 추천 링크 생성 | `referral_links.created_at` | 새 표 |
| 추천 링크 방문 | `referral_visits` (익명 방문 번호) | **새로 수집**(기존 `funnel_events`에는 없음) |
| 추천 링크로 신규 가입 | `referral_signups.signed_up_at` | 새 표 |
| 500P 대기 · 확정 | `referral_signups.status` · `point_ledger` | 새 표 |
| 신규 회원 무료 분석 완료 | `assessments`(회원의 저장된 결과) — **기존 DB에서 집계 가능** | 기존 |
| 첫 심층 리포트 구매 | `orders`(provider tosspayments · 심층 · `status paid`) — **기존** | 기존 |
| 첫 구매 환불 | `orders.status = 'refunded'` — **기존** | 기존 |
| 재구매 | `orders` 두 번째 이후(`:r<번째>`) — **기존** | 기존 |

필수 지표(모두 `referral_signups`를 중심에 두고 계산): 방문 → 가입 전환율 · 가입 → 첫 구매 전환율 · 7일 · 30일 첫 구매 전환율(가입 시각 기준 창) · 추천인당 실제 구매자 수 · 추천 가입자 한 명당 평균 보상 비용(500P의 기대 비용 + 무료 이용 원가) · 추천 첫 구매 한 건당 총 보상 · 할인 비용(할인액 3,000 + 포인트 + 질문권 2 + 리뷰 질문권) · 추천 유입 고객의 평균 순매출 · 공헌이익 · **구매 없이 가입만 쌓인 보상 비용**(전환 0인 가입의 합).

### 10-2. 질문 1회당 실제 AI 원가 (지시 10)

현재 `ai_usage`에는 모델 · 입력 · 출력 토큰 · 비용 · 결과가 있지만 **상담방 · 질문권 종류 · 구매 건 · 시도 번호가 없다.** `ai_usage`에 열 `purpose · room_key · credit_kind · attempt_no · is_retry · order_id`를 더하고(4-8) 질문 처리의 `addAiUsage` 호출 지점(`chat-service.ts` 347행 근처)에서 같이 기록한다. 질문 내용 · 답은 기록하지 않는다(기존 원칙).

| 지표 | 계산 |
| --- | --- |
| 질문 1회당 평균 원가 | 성공한 질문의 `est_cost_krw` 합 ÷ 질문 수(재시도 · 실패 호출 비용 포함 / 제외를 둘 다 표시) |
| 상담방별 · 모델별 · 질문권 종류별 | `room_key` · `model` · `credit_kind`로 그룹 |
| 상위 95% 비용 | 질문별 비용 분포의 95 백분위 |
| 실패 · 재시도로 늘어난 비용 | `outcome != 'ok'` 또는 `is_retry`인 호출의 합 |
| 구매 한 건에 연결된 평균 무료 질문 비용 | 심층 리포트 구매 회원의 무료 질문 호출 비용 ÷ 구매 수(주문 연결 열 사용) |

**임의의 30원으로 고정하지 않는다.** 손익 모델 기본값 17원은 실제로 잰 1건(입력 2,983 · 출력 455토큰)이고 표본이 부족하다고 표시한다. 실제 사용량이 쌓이면 이 집계로 `DEFAULT_ASSUMPTIONS`를 바꾼다.

### 10-3. 포인트 사용률 (지시 11)

`point_ledger`의 `kind`별 합으로: 총 발행(적립 · 추천 · 운영자 · 이벤트 · 쿠폰) · 현재 사용 가능(로트 `remaining` 중 미만료) · 사용률 = 사용 ÷ 발행(30일 · 90일 창, 발행 코호트 기준) · 상품별 교환량 · 교환 주문의 AI 원가(주문 연결 `ai_usage`) · **포인트 사용 회원의 이후 현금 구매율**과 **보유자 vs 미보유자 재구매율**(코호트 비교) · 예상 미사용 포인트 부담(잔액 × 기대 비용/P). **사용률이 높다고 성공으로 판단하지 않는다 — 포인트 사용이 추가 현금 매출을 만들었는지(사용 회원의 사용 후 현금 구매 vs 비슷한 비사용 회원)를 같이 본다.** 잠식(포인트가 없었다면 샀을 구매)은 직접 관측할 수 없어 **코호트 비교로 근사**할 뿐이며 인과가 아니다.

### 10-4. 전환율 지표 (지시 13) — 기존 집계 vs 새 수집

| 지표 | 상태 |
| --- | --- |
| 무료 분석 완료율 | 기존(`funnel_events` `analyze_start` · `analyze_complete`, 방문 기록 기준) |
| 무료 → 개인 심층 결제율 | 기존(`assessments` 저장 수 vs 심층 `orders` — 서버 기록) |
| 무료 궁합 → 사주 궁합 전환율 | **새로 수집**(무료 궁합은 입력을 저장하지 않는다 → 익명 이벤트 `compat_start` · `compat_result` · `compat_to_paid_click`이 필요, `funnel_events` 허용 값 확장 또는 새 표). 사주 궁합 판매 전에는 전환이 0 |
| 사주 궁합 → 리포트 궁합 전환율 | 새(두 상품이 판매된 뒤 `orders`로 집계) |
| 추천 가입 → 첫 구매율 | 새 표(10-1) |
| 리포트 읽기 완료율 | 일부 기존(`report_view`는 열람이고 "끝까지 읽음"이 아니다) → **새 이벤트**(스크롤 · 마지막 영역 도달) 필요 |
| 결제 후 질문 사용률 | 기존(`chat_questions`와 `orders`) |
| 포인트 사용 후 재구매율 | 새 표(10-3) |

---

## 11. 구현 계획 (6~10단계 — 이 설계를 운영자가 본 뒤)

| 단계 | 일 | 파일 · DB · 화면(예정, 실제 변경은 이후) |
| --- | --- | --- |
| 6 | 신규 마이그레이션 19~23 + 서버 로직 | `supabase/migrations/…_benefits_core.sql` · `…_coupons_free_orders.sql` · `…_referrals.sql` · `…_reviews.sql` · `…_finance_and_ai_context.sql` · `supabase/check-benefits.sql`(읽기 전용 대조) · `lib/commerce/{points,credits,coupons,referral,review,tier}.ts`(순수 규칙) · `lib/services/{benefit,referral,coupon,review,finance}-service.ts` · `lib/services/ports.ts` · `lib/integrations/supabase/repository.ts` · 메모리 저장소 · 탈퇴 함수 갱신 · `INVITE_DISCOUNT` 교체(6,900 · 한도 제거) |
| 7 | MY · 쿠폰 적용 · 교환 | `app/my/benefits/*` · `app/checkout` 견적 화면(할인 선택 · 적격 아님 안내 · 확인) · `components/results/purchase-panel.tsx` · `invite-section.tsx` · 포인트 교환 화면 · 질문 사용 순서(`chat-service.ts`) |
| 8 | 추천 · 리뷰 · 적립 연결 | 가입 완료(`auth-complete.ts`)에서 쿠키 토큰으로 `register_referral_signup` · 주문 `paid` 트리거로 적립 · `confirm_referral_purchase` · 리뷰 화면 · 정기 점검(확정 · 만료) |
| 8-관리 | 관리자 화면 | `/admin/benefits` · `/admin/coupons` · `/admin/referrals` · `/admin/ledgers` · `/admin/profit` + `metrics-service` 확장 + `ai_usage` 새 열 기록 |
| 9 | 시험 | 중복 · 환불 · 오류 · 남용: 같은 웹훅 재전송 · 동시 교환 · 동시 질문 · 쿠폰 한도 경합 · 환불 시 회수와 음수 방지 · 자기 추천 · 대량 가입 · 설정 변경 이력 · 장부 일치(단위 + 임시 Postgres `npm run test:db`) |
| 10 | 운영 적용 전 | 실제 원가 측정으로 `DEFAULT_ASSUMPTIONS` 갱신 · 세무사 · 법률 검토(8장 · `tax-review-checklist.md`) · 약관 · 처리방침 · **운영 DB 적용은 운영자가 직접, 승인 후** |

기존 개발 순서(① P01 실제 AI → ② … → ⑩ 배포 QA)는 유지한다 — 이 작업은 ⑧ "초대 할인 · 질문권"을 최신 정책으로 대체하고 ⑦ 수익 구조 마감의 상세다.

---

## 12. 문서에 남은 옛 서술 목록 (C11)

이번 작업에서 **고친 것**: `CLAUDE.md`(초대 정책 · 혜택 시스템 원칙 · 수익 관리) · `docs/v1-scope.md`(D13 최신화 · 세무 · 혜택 항목).

**"구현은 옛 정책, 6단계에서 교체"로 표시만 한 것**: `docs/compat-proposal.md` 7 · 8장 · `docs/launch-checklist.md` · `docs/runbook.md` · `docs/update-guide.md` · `docs/service-v2-proposal.md`의 5,900원 · 3명 서술, 코드 주석(`lib/config/product.ts`의 `INVITE_DISCOUNT` 설명).

**아직 코드가 옛 정책 그대로다**: `INVITE_DISCOUNT`(5,900원 · 3명), `order-service`의 정가 자동 이어 가기, `/invite/<토큰>` · `invite-section.tsx` 문구, DB 18의 한도 · 구매 조건. 이 값들은 6단계 새 마이그레이션 · 서버 로직으로 바꾼다 — 지금 바꾸지 않은 이유: 운영 DB에 18번이 적용됐는지 확인 전이고(`supabase/check-migrations.sql`), 새 정책의 일부(추천 가입 대기 · 확정, 0원 주문)가 아직 없어 가격만 바꾸면 보상 없이 할인만 나가는 반쪽 상태가 되기 때문이다.

---

## 13. 하지 못한 것 · 하지 않은 것

- 법률 · 세무 판단 없음. 청년창업 감면 · 과세 유형 · 포인트 회계는 확인 전이며 `docs/tax-review-checklist.md`에 세무사 확인 항목으로 남겼다.
- 실제 환경(실제 Supabase · 토스) · 실제 AI 호출로 검증한 것 없음. 손익의 AI 원가는 실제로 잰 소수 값(리포트 5건 · 질문 1건)이고 나머지는 가정이다.
- 마이그레이션 SQL을 쓰지 않았다(이 문서의 표 · 열은 설계안). 제약 완화 1건은 승인 대기.
- 추천 위험 신호의 임계값(1시간 10명 · 10초 · 72시간)은 제안이며 실제 가입 데이터로 정하지 않았다.
- 포인트 만료 · 정산 · 탈퇴 보존 · 가격 표기는 7장 질문에 답이 필요하다.

---

## 14. 구현 현황 (2026-10-17, 개발 · 테스트 환경 — 운영 DB 적용 · 실결제 · 보상 실지급 없음)

**만든 것**: DB 19 `benefits_core` · 20 `coupons_free_orders` · 21 `referrals` · 22 `benefit_finance_ai`(모두 새 파일, 기존 마이그레이션 수정 없음) · `BenefitRepository`(Supabase · 메모리) · `benefit-service` · `benefit-admin-service` · 결제 전 견적과 가격 계획 · 채팅 질문권 사용 순서(무료 → 보상 질문권 → 결제한 질문) · 추천 가입 등록 · 정기 점검 연결 · 서버 동작(결제 · MY · 관리자) · MY 혜택 화면 · 결제 가격 선택 화면 · 관리자 `/admin/benefits`(개요 · 스위치 · 쿠폰 · 추천 · 손익) · `supabase/check-benefits.sql`.

**기본 상태**: 모든 혜택 스위치가 꺼진 채로 시작한다 — 마이그레이션을 적용해도 아무것도 지급되지 않는다. 화면에서는 스위치를 켠 것(포인트 카드 · 친구 초대 · 쿠폰 줄 · 결제 화면의 할인 선택)만 보이고, MY 머리글 · "남은 질문권" 카드 · `/my/benefits`의 "준비하고 있어요" 안내는 스위치와 관계없이 보인다.

**확인한 것(임시 Postgres · 가짜 결제)**: `npm run test:db` 70개(기존 54 + 혜택 11 + 사주 궁합 5) · 단위 시험(견적 · 쿠폰 · 포인트 · 추천 · 환불 회수 · 0원 주문 · 질문권 순서 · 관리자 서비스). 확인한 규칙: 선입선출 사용 · 같은 참조번호 한 번만 차감 · 되돌림 한 번 · 장부 합계 = 묶음 잔여 · 장부 수정 · 삭제 거절 · 환불 회수와 `shortfall` · 쿠폰 한도 동시성(8명 → 1명) · 질문권 동시 차감(8번 → 1번) · 추천 가입 확정 조건 · 추천 가격 동시 시작 · 0원 주문 직접 삽입 거절 · 혜택 지급 실패가 결제를 막지 않음 · 탈퇴 정리 · 본인만 조회 · 브라우저의 쓰기 · 함수 호출 거절.

**하지 않은 것 · 못 한 것**: 운영 DB 적용(운영자 승인 전) · 실제 Supabase · 실제 토스에서의 확인 · 후기(리뷰) 시스템 · 법률 · 세무 검토 · 약관 · 처리방침에 혜택 조건 문구 · 실제 로그인 상태의 화면 확인(화면은 가상 값 미리보기 `/dev/*-preview`로만 봤다) · 추천 위험 신호 임계값의 실제 데이터 검증.
