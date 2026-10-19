// 테스트용 메모리 저장소. DB 고유 조건과 상태 변경 규칙을 흉내 낸다.
// 운영 코드에서 쓰지 않는다.

import { canTransition } from "../../commerce/order.ts";
import { isPersonalProduct, MIYU_CASH, PERSONAL_REPORT, parseCashProductId } from "../../config/product.ts";
import { packRemaining, refundSchedule } from "../../commerce/cash.ts";
import type { InviteDiscountCheck } from "../../commerce/invite.ts";
import type { ConsentRecord } from "../../membership/terms.ts";
import type { ConcernRecord } from "../../personalization/concern.ts";
import type { PersonalContext } from "../../personalization/context.ts";
import type {
  CompatRequestRecord,
  AiUsageRecord,
  CashLedgerRecord,
  CashRefundResult,
  QuestionPackRecord,
  FeedbackRecord,
  FunnelEventRecord,
  OpsEventRecord,
  PaymentEventSource,
  AssessmentRecord,
  InviteRecord,
  MiyuRepository,
  OrderRecord,
  ProfileRecord,
  ReportRecord,
  TalkRoomRecord,
  ChatSummaryRecord,
  TalkTranscriptRecord,
} from "../ports.ts";

export function createMemoryRepository(now: () => Date = () => new Date()) {
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
  const profiles = new Map<string, ProfileRecord>();
  const regions = new Map<string, { province: string; district: string }>();
  const assessments = new Map<string, AssessmentRecord>();
  // myDelete.ready=false이면 28번(기록 삭제) 적용 전 DB를 흉내 낸다 — 삭제 열이 없어 recordDeletedAt이 비어 있고(undefined) 삭제 함수는 42P01
  // myDelete.purge=true이면 29번(삭제 범위 확대) 적용 후 DB를 흉내 낸다 — 기본은 false(예전 범위 삭제만 있는 DB)라서 28번 시험이 그대로 통과한다.
  // pairRefs에 검사 번호를 넣으면 리포트 궁합 쌍이 그 결과를 가리키는 것으로 본다(분석 원자료를 비우지 않는다)
  const myDelete = { ready: true, purge: false, pairRefs: new Set<string>() };
  const orders = new Map<string, OrderRecord>();
  /** 주문 상태가 바뀔 때 부르는 훅(테스트용 혜택 저장소가 DB 트리거 대신 등록한다) */
  const orderHooks: ((before: OrderRecord, after: OrderRecord) => void)[] = [];
  /** 회원 탈퇴 처리가 끝났을 때 부르는 훅(테스트용 저장소가 DB의 "프로필 탈퇴 표시" 트리거 대신 등록한다) */
  const withdrawHooks: ((userId: string) => void)[] = [];
  const reports = new Map<string, ReportRecord>();
  const events: { orderId: string; source: PaymentEventSource; status: string | null; detail: Record<string, unknown>; createdAt: string }[] = [];
  const consents = new Map<string, ConsentRecord[]>();
  const contexts = new Map<string, PersonalContext>();
  const concernRecords = new Map<string, ConcernRecord>();
  const compatRequests = new Map<string, CompatRequestRecord>();
  const talkRooms = new Map<string, TalkRoomRecord>();
  // 삭제한 기록의 읽기용 대화 기록 (DB 28번의 talk_transcripts)
  const transcripts = new Map<string, TalkTranscriptRecord>();
  const chatQuestions: { userId: string; assessmentId: string; roomKey: string; createdAt: string }[] = [];
  // 무료 질문 자리 예약(답을 기다리는 중) — 10분 안에만 센다
  const chatReservations: { id: number; userId: string; assessmentId: string; roomKey: string; until: number }[] = [];
  // 맛보기 리포트 — 회원 한 명이 한 줄 (until: 작성 중 예약이 유효한 시각, 완성이면 null)
  type TasteRow = { userId: string; assessmentId: string; status: "pending" | "ready"; content: unknown | null; generator: string | null; generatorVersion: string | null; createdAt: string; until: number | null };
  const tasteReports = new Map<string, TasteRow>();
  const tasteRecord = (r: TasteRow) => ({ userId: r.userId, assessmentId: r.assessmentId, status: r.status, content: r.content, generator: r.generator, generatorVersion: r.generatorVersion, createdAt: r.createdAt });
  // 초대 링크(결과마다 하나) · 초대 할인 기록(초대받은 회원 한 명당 한 줄) — DB 18번의 표 · 함수를 흉내 낸다
  const invites = new Map<string, InviteRecord>();
  const discounts = new Map<string, { inviteeUserId: string; inviteId: string | null; inviterUserId: string; orderId: string }>();
  const hasPaidPersonal = (userId: string) => [...orders.values()].some((o) => o.userId === userId && o.status === "paid" && isPersonalProduct(o.productId));
  const hasConsumedPersonal = (userId: string) => [...orders.values()].some((o) => o.userId === userId && (o.status === "paid" || o.status === "refunded") && isPersonalProduct(o.productId));
  const liveDiscountCount = (inviterUserId: string, exceptInvitee: string) =>
    [...discounts.values()].filter((d) => {
      if (d.inviterUserId !== inviterUserId || d.inviteeUserId === exceptInvitee) return false;
      const o = orders.get(d.orderId);
      return Boolean(o && (o.status === "paid" || (o.status === "pending" && now().getTime() - new Date(o.createdAt).getTime() < 3600_000)));
    }).length;
  /** 링크 · 초대한 사람 · 이 사람의 구매 상태 확인 — DB의 invite_discount_status와 같은 순서 */
  const inviteChecks = (token: string, invitee: string, cap: number): { inv: InviteRecord } | InviteDiscountCheck => {
    const inv = [...invites.values()].find((i) => i.token === token);
    if (!inv) return { ok: false, reason: "invalid" };
    if (inv.inviterTier !== "deep") return { ok: false, reason: "not-deep" };
    if (inv.inviterUserId === invitee) return { ok: false, reason: "self" };
    if (!hasPaidPersonal(inv.inviterUserId)) return { ok: false, reason: "inviter-not-paid" };
    const own = discounts.get(invitee);
    if (own) {
      const status = orders.get(own.orderId)?.status;
      if (status === "paid" || status === "refunded") return { ok: false, reason: "already-used" };
    } else if (hasConsumedPersonal(invitee)) return { ok: false, reason: "not-first" };
    const used = liveDiscountCount(inv.inviterUserId, invitee);
    if (used >= cap) return { ok: false, reason: "cap" };
    return { inv };
  };
  let reservationSeq = 0;
  const liveReservations = (userId: string, roomKey: string) => chatReservations.filter((r) => r.userId === userId && r.roomKey === roomKey && r.until > now().getTime()).length;
  const chatSummaries: ChatSummaryRecord[] = [];
  // 미유캐시 — DB의 지갑 · 내역 · 트리거(충전 · 회수) · 함수(차감 · 되돌림)를 흉내 낸다
  const wallets = new Map<string, number>();
  const ledger: (CashLedgerRecord & { userId: string; ref: string | null; packOrderId: string | null })[] = [];
  let ledgerSeq = 0;
  const addLedger = (row: { userId: string; kind: CashLedgerRecord["kind"]; amount: number; orderId?: string | null; ref?: string | null; shortfall?: number; packOrderId?: string | null }): boolean => {
    // 같은 주문의 같은 종류 · 같은 참조번호의 같은 종류는 한 번만 (DB 고유 조건 — 묶음 환불(refund_claw)은 한 주문에 여러 번이라 주문 기준에서 빠진다)
    if (row.orderId && row.kind !== "refund_claw" && ledger.some((l) => l.orderId === row.orderId && l.kind === row.kind)) return false;
    if (row.ref && ledger.some((l) => l.ref === row.ref && l.kind === row.kind)) return false;
    ledger.push({ id: ++ledgerSeq, userId: row.userId, kind: row.kind, amount: row.amount, orderId: row.orderId ?? null, ref: row.ref ?? null, shortfall: row.shortfall ?? 0, packOrderId: row.packOrderId ?? null, createdAt: new Date(now().getTime() + ledgerSeq).toISOString() });
    return true;
  };
  // 질문 묶음(주문)별 장부 — DB question_packs · ensure_question_pack · apply_cash_refund와 같은 규칙
  const packs = new Map<string, QuestionPackRecord>();
  const ensurePack = (order: OrderRecord) => {
    const cash = parseCashProductId(order.productId);
    if (!cash || cash.bonus !== 0 || cash.cash <= 0 || cash.cash % MIYU_CASH.perQuestion !== 0 || order.amount <= 0 || packs.has(order.id)) return;
    packs.set(order.id, { orderId: order.id, userId: order.userId, questions: cash.cash / MIYU_CASH.perQuestion, priceKrw: order.amount, used: 0, refundedQuestions: 0, refundedKrw: 0, purchasedAt: order.approvedAt ?? now().toISOString() });
  };
  const applyRefund = (orderId: string, canceledTotal: number): CashRefundResult => {
    const pack = packs.get(orderId);
    if (!pack) return { status: "no-pack" };
    const allowed = refundSchedule(pack.priceKrw, pack.questions);
    if (!Number.isInteger(canceledTotal) || canceledTotal <= 0 || canceledTotal > pack.priceKrw) return { status: "invalid-amount", allowed };
    const idx = allowed.indexOf(canceledTotal);
    if (idx < 0) return { status: "amount-mismatch", allowed, refundedKrw: pack.refundedKrw };
    const k = idx + 1;
    if (k <= pack.refundedQuestions) return { status: "already", questions: pack.refundedQuestions, refundedKrw: pack.refundedKrw };
    const delta = k - pack.refundedQuestions;
    const remaining = packRemaining(pack);
    const balance = wallets.get(pack.userId) ?? 0;
    const take = Math.min(delta, remaining, Math.floor(balance / MIYU_CASH.perQuestion));
    pack.refundedQuestions = k;
    pack.refundedKrw = canceledTotal;
    addLedger({ userId: pack.userId, kind: "refund_claw", amount: -(take * MIYU_CASH.perQuestion), orderId, ref: `refund:${orderId}:${k}`, shortfall: (delta - take) * MIYU_CASH.perQuestion });
    if (take > 0) wallets.set(pack.userId, balance - take * MIYU_CASH.perQuestion);
    return { status: "applied", questions: k, refundedKrw: canceledTotal, clawed: take, shortfall: delta - take };
  };
  /** 주문 상태가 바뀔 때의 충전 · 회수 — DB 트리거(orders_cash_change)와 같은 규칙 */
  const onOrderChange = (before: OrderRecord, after: OrderRecord) => {
    const cash = parseCashProductId(after.productId);
    if (!cash || before.status === after.status) return;
    if (after.status === "paid") {
      if (!wallets.has(after.userId)) wallets.set(after.userId, 0);
      if (cash.cash > 0 && addLedger({ userId: after.userId, kind: "charge", amount: cash.cash, orderId: after.id })) {
        wallets.set(after.userId, wallets.get(after.userId)! + cash.cash);
        ensurePack(after);
      }
      if (cash.bonus > 0 && addLedger({ userId: after.userId, kind: "bonus", amount: cash.bonus, orderId: after.id })) wallets.set(after.userId, wallets.get(after.userId)! + cash.bonus);
    } else if (after.status === "refunded" && before.status === "paid") {
      if (packs.has(after.id)) {
        // 묶음 장부가 있는 주문: 전액 취소 = 결제액 전체를 누적 환불로 반영 (이 묶음의 남은 질문만 회수)
        applyRefund(after.id, after.amount);
        return;
      }
      const credited = ledger.filter((l) => l.orderId === after.id && (l.kind === "charge" || l.kind === "bonus")).reduce((s, l) => s + l.amount, 0);
      if (credited > 0) {
        const take = Math.min(wallets.get(after.userId) ?? 0, credited);
        if (addLedger({ userId: after.userId, kind: "clawback", amount: -take, orderId: after.id, shortfall: credited - take })) wallets.set(after.userId, (wallets.get(after.userId) ?? 0) - take);
      }
    }
  };
  const opsEvents: OpsEventRecord[] = [];
  const aiUsage: AiUsageRecord[] = [];
  const funnel: FunnelEventRecord[] = [];
  const feedback = new Map<string, FeedbackRecord>();
  let tick = 0;
  const iso = () => now().toISOString();
  /** 삭제 열이 있는 DB(28번 후)는 값이 null 또는 시각이고, 없는 DB는 비어 있다(undefined) */
  const withDeleteColumn = (a: AssessmentRecord): AssessmentRecord => {
    if (!myDelete.ready) {
      const { recordDeletedAt: _unused, ...rest } = a; // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest;
    }
    // 29번 열(삭제 범위 확대)이 없는 DB는 값이 비어 있다(undefined)
    return myDelete.purge ? { ...a, recordDeletedAt: a.recordDeletedAt ?? null, recordPurgedAt: a.recordPurgedAt ?? null } : { ...a, recordDeletedAt: a.recordDeletedAt ?? null };
  };

  const repo: MiyuRepository = {
    async listConsents(userId) {
      return [...(consents.get(userId) ?? [])];
    },
    async addConsents(userId, list) {
      // 같은 시각에 여러 번 기록해도 순서가 구분되도록 1ms씩 더한다
      const rows = list.map((c) => ({ ...c, createdAt: new Date(now().getTime() + ++tick).toISOString() }));
      consents.set(userId, [...(consents.get(userId) ?? []), ...rows]);
    },
    async getProfile(userId) {
      return profiles.get(userId) ?? null;
    },
    async ensureProfile(userId) {
      const p = profiles.get(userId) ?? { userId, nickname: null, paymentCustomerKey: `ck-${userId}` };
      profiles.set(userId, p);
      return p;
    },
    async withdrawMemberData(userId) {
      if (!profiles.has(userId)) return { ok: false, reason: "not-found" };
      const mine = (o: OrderRecord) => o.userId === userId;
      if ([...orders.values()].some((o) => mine(o) && o.status === "pending" && now().getTime() - new Date(o.createdAt).getTime() < 3600_000)) return { ok: false, reason: "pending-order" };
      if ([...reports.values()].some((r) => r.userId === userId && (r.status === "queued" || r.status === "generating"))) return { ok: false, reason: "report-in-progress" };
      if ((wallets.get(userId) ?? 0) > 0) return { ok: false, reason: "cash-balance" };
      const counts = { reports: 0, assessments_deleted: 0, assessments_emptied: 0, personal_contexts: 0, concern_records: 0, feedback: 0, regions: 0, talk_rooms: 0, chat_questions: 0, chat_summaries: 0, taste_reports: 0, invites: 0 };
      for (const [k, f] of [...feedback]) {
        if (f.userId !== userId) continue;
        feedback.delete(k);
        counts.feedback++;
      }
      for (const [k, c] of [...contexts]) {
        if (c.userId !== userId) continue;
        contexts.delete(k);
        counts.personal_contexts++;
      }
      for (const [k, c] of [...concernRecords]) {
        if (c.userId !== userId) continue;
        concernRecords.delete(k);
        counts.concern_records++;
      }
      // 사주 궁합의 상대 출생정보는 탈퇴하면 비운다(DB는 프로필의 탈퇴 표시 트리거가 한다)
      for (const [k, c] of [...compatRequests]) {
        if (c.userId !== userId || c.scrubbedAt) continue;
        compatRequests.set(k, { ...c, partner: null, scrubbedAt: new Date(now().getTime()).toISOString() });
      }
      for (const [k, t] of [...talkRooms]) {
        if (t.userId !== userId) continue;
        talkRooms.delete(k);
        counts.talk_rooms++;
      }
      for (let i = chatQuestions.length - 1; i >= 0; i--) {
        if (chatQuestions[i].userId !== userId) continue;
        chatQuestions.splice(i, 1);
        counts.chat_questions++;
      }
      for (let i = chatSummaries.length - 1; i >= 0; i--) {
        if (chatSummaries[i].userId !== userId) continue;
        chatSummaries.splice(i, 1);
        counts.chat_summaries++;
      }
      if (tasteReports.delete(userId)) counts.taste_reports++;
      for (const [k, v] of [...invites]) {
        if (v.inviterUserId !== userId) continue;
        invites.delete(k);
        counts.invites++;
      }
      for (const [k, r] of [...reports]) {
        if (r.userId !== userId) continue;
        reports.delete(k);
        counts.reports++;
      }
      if (regions.delete(userId)) counts.regions++;
      const ordered = new Set([...orders.values()].filter(mine).map((o) => o.assessmentId));
      for (const [k, a] of [...assessments]) {
        if (a.userId !== userId) continue;
        if (!ordered.has(a.id)) {
          assessments.delete(k);
          counts.assessments_deleted++;
        } else if (a.nickname !== "탈퇴") {
          assessments.set(k, { ...a, nickname: "탈퇴", knownMbti: null, answers: {}, summary: {} as AssessmentRecord["summary"], saju: {} as AssessmentRecord["saju"], contentVersion: "withdrawn" });
          counts.assessments_emptied++;
        }
      }
      profiles.set(userId, { ...profiles.get(userId)!, nickname: null });
      for (const hook of withdrawHooks) hook(userId);
      return { ok: true, counts };
    },
    async updateProfileNickname(userId, nickname) {
      const p = profiles.get(userId) ?? { userId, nickname: null, paymentCustomerKey: `ck-${userId}` };
      profiles.set(userId, { ...p, nickname });
    },
    async saveRegion(userId, region) {
      regions.set(userId, region);
    },
    async insertAssessment(a) {
      const record = { ...a, id: id(), createdAt: iso() };
      assessments.set(record.id, record);
      return record;
    },
    async getAssessment(assessmentId) {
      const a = assessments.get(assessmentId);
      return a ? withDeleteColumn(a) : null;
    },
    async listAssessments(userId) {
      return [...assessments.values()].filter((a) => a.userId === userId).map(withDeleteColumn);
    },
    async deleteAssessmentRecord(userId, assessmentId, input) {
      // DB 함수 delete_assessment_record(28번)와 같은 규칙 — 소유자 · 이미 삭제 · 진행 중 확인 → 대화방 확인 · 읽기용 대화 기록 → 리포트 본문 · 고민 · 맛보기 글 삭제 → 삭제 표시
      if (!myDelete.ready) throw Object.assign(new Error("삭제 함수가 없습니다 (DB 변경 28번 필요)"), { code: "42P01" });
      const a = assessments.get(assessmentId);
      if (!a || a.userId !== userId || a.contentVersion === "withdrawn") return "not-found";
      if (a.recordDeletedAt) return "unchanged";
      const nowMs = now().getTime();
      const isReportOrder = (productId: string) => productId === "personal-integrated-report" || productId.startsWith("personal-integrated-report:r") || productId.startsWith("concern-report:");
      const mine = [...orders.values()].filter((o) => o.assessmentId === assessmentId);
      // 1) 생성 중인 리포트(어느 상품이든) 2) 결제 대기 주문(질문 결제 제외) 3) 결제는 끝났는데 리포트 줄이 아직 없는 궁합 주문 4) 맛보기 작성 중 5) 답을 기다리는 질문 · 방금 오간 질문
      const generating = [...reports.values()].some((r) => r.assessmentId === assessmentId && (r.status === "queued" || r.status === "generating") && nowMs - new Date(r.updatedAt).getTime() < 15 * 60_000);
      const pendingOrder = mine.some((o) => o.status === "pending" && nowMs - new Date(o.createdAt).getTime() < 60 * 60_000 && !o.productId.startsWith("cash-charge:"));
      const compatWithoutReport = mine.some((o) => o.status === "paid" && (o.productId.startsWith("saju-compat:") || o.productId.startsWith("report-compat:")) && ![...reports.values()].some((r) => r.orderId === o.id));
      const t = tasteReports.get(userId);
      const tastePending = !!t && t.assessmentId === assessmentId && t.status === "pending" && t.until !== null && t.until > nowMs;
      const chatInFlight = chatReservations.some((r) => r.assessmentId === assessmentId && r.until > nowMs) || chatQuestions.some((c) => c.assessmentId === assessmentId && nowMs - new Date(c.createdAt).getTime() < 30_000);
      const spentJustNow = ledger.some((l) => l.userId === userId && l.kind === "spend" && nowMs - new Date(l.createdAt).getTime() < 30_000);
      if (generating || pendingOrder || compatWithoutReport || tastePending || chatInFlight || spentJustNow) return "busy";

      // 대화방: 앱이 읽은 그대로인지 확인하고 읽기용 기록을 저장한 뒤 행동 목록 줄을 정리한다
      const rooms = [...talkRooms.values()].filter((r) => r.assessmentId === assessmentId);
      const staged: TalkTranscriptRecord[] = [];
      for (const room of rooms) {
        const entry = input.find((x) => x.roomKey === room.roomKey && x.updatedAt === room.updatedAt);
        if (!entry) return "stale";
        if (entry.lines.length > 0) staged.push({ assessmentId, roomKey: room.roomKey, userId, lines: entry.lines, createdAt: iso() });
      }
      for (const row of staged) transcripts.set(`${assessmentId}|${row.roomKey}`, row);
      for (const room of rooms) talkRooms.delete(`${room.assessmentId}|${room.roomKey}`);

      for (const r of [...reports.values()]) {
        const o = orders.get(r.orderId);
        if (r.assessmentId === assessmentId && o && isReportOrder(o.productId)) {
          reports.delete(r.id);
          feedback.delete(r.id);
        }
      }
      contexts.delete(assessmentId);
      for (const c of [...concernRecords.values()]) if (c.assessmentId === assessmentId) concernRecords.delete(c.id);
      if (t && t.assessmentId === assessmentId) {
        if (t.status === "pending") tasteReports.delete(userId);
        else {
          t.content = { deleted: true };
          t.generator = null;
          t.generatorVersion = null;
        }
      }
      assessments.set(assessmentId, { ...a, recordDeletedAt: iso() });
      return "deleted";
    },
    async purgeAvailable() {
      return myDelete.ready && myDelete.purge;
    },
    async purgeAssessmentRecord(userId, assessmentId) {
      // DB 함수 delete_assessment_record_v2(29번)와 같은 규칙 — 소유자 · 이미 삭제 · 진행 중 확인 → 대화(방 · 요약 · 읽기용 기록) · 리포트 본문 · 고민 · 맛보기 글 삭제 → 분석 원자료 비우기(쌍이 가리키지 않을 때) → 삭제 표시 둘
      if (!myDelete.ready || !myDelete.purge) throw Object.assign(new Error("delete_assessment_record_v2 함수가 없습니다 (DB 변경 29번 필요)"), { code: "PURGE_UNAVAILABLE" });
      const a = assessments.get(assessmentId);
      if (!a || a.userId !== userId || a.contentVersion === "withdrawn") return "not-found";
      if (a.recordDeletedAt) return "unchanged";
      const nowMs = now().getTime();
      const isReportOrder = (productId: string) => productId === "personal-integrated-report" || productId.startsWith("personal-integrated-report:r") || productId.startsWith("concern-report:");
      const mine = [...orders.values()].filter((o) => o.assessmentId === assessmentId);
      const generating = [...reports.values()].some((r) => r.assessmentId === assessmentId && (r.status === "queued" || r.status === "generating") && nowMs - new Date(r.updatedAt).getTime() < 15 * 60_000);
      const pendingOrder = mine.some((o) => o.status === "pending" && nowMs - new Date(o.createdAt).getTime() < 60 * 60_000 && !o.productId.startsWith("cash-charge:"));
      const compatWithoutReport = mine.some((o) => o.status === "paid" && (o.productId.startsWith("saju-compat:") || o.productId.startsWith("report-compat:")) && ![...reports.values()].some((r) => r.orderId === o.id));
      const t = tasteReports.get(userId);
      const tastePending = !!t && t.assessmentId === assessmentId && t.status === "pending" && t.until !== null && t.until > nowMs;
      const chatInFlight = chatReservations.some((r) => r.assessmentId === assessmentId && r.until > nowMs) || chatQuestions.some((c) => c.assessmentId === assessmentId && nowMs - new Date(c.createdAt).getTime() < 30_000);
      const spentJustNow = ledger.some((l) => l.userId === userId && l.kind === "spend" && nowMs - new Date(l.createdAt).getTime() < 30_000);
      if (generating || pendingOrder || compatWithoutReport || tastePending || chatInFlight || spentJustNow) return "busy";

      // 대화 내용(방 · 요약 · 읽기용 기록)은 이 결과의 것만 지운다. 질문 횟수(chatQuestions) · 질문권 장부는 내용이 없는 사용 이력이라 그대로 둔다
      for (const k of [...talkRooms.keys()]) if (talkRooms.get(k)!.assessmentId === assessmentId) talkRooms.delete(k);
      for (let i = chatSummaries.length - 1; i >= 0; i--) if (chatSummaries[i].assessmentId === assessmentId && chatSummaries[i].userId === userId) chatSummaries.splice(i, 1);
      for (const k of [...transcripts.keys()]) if (transcripts.get(k)!.assessmentId === assessmentId && transcripts.get(k)!.userId === userId) transcripts.delete(k);
      for (const r of [...reports.values()]) {
        const o = orders.get(r.orderId);
        if (r.assessmentId === assessmentId && o && isReportOrder(o.productId)) {
          reports.delete(r.id);
          feedback.delete(r.id);
        }
      }
      contexts.delete(assessmentId);
      for (const c of [...concernRecords.values()]) if (c.assessmentId === assessmentId) concernRecords.delete(c.id);
      if (t && t.assessmentId === assessmentId) {
        if (t.status === "pending") tasteReports.delete(userId);
        else {
          t.content = { deleted: true };
          t.generator = null;
          t.generatorVersion = null;
        }
      }
      const stamp = iso();
      const scrub = myDelete.pairRefs.has(assessmentId)
        ? {}
        : ({ nickname: "삭제", calendar: "solar", isLeapMonth: false, birthYear: 1900, birthMonth: 1, birthDay: 1, birthTime: null, knownMbti: null, answers: {}, summary: {}, saju: {}, contentVersion: "record-deleted" } as unknown as Partial<AssessmentRecord>);
      assessments.set(assessmentId, { ...a, ...scrub, recordDeletedAt: stamp, recordPurgedAt: stamp });
      return "deleted";
    },
    async listTalkTranscripts(assessmentId) {
      return [...transcripts.values()].filter((r) => r.assessmentId === assessmentId).sort((x, y) => (x.roomKey < y.roomKey ? -1 : 1));
    },
    async getOrderByNumber(orderNumber) {
      return [...orders.values()].find((o) => o.orderNumber === orderNumber) ?? null;
    },
    async listOrdersForAssessment(assessmentId) {
      return [...orders.values()].filter((o) => o.assessmentId === assessmentId);
    },
    async listOrdersForUser(userId) {
      return [...orders.values()].filter((o) => o.userId === userId);
    },
    async insertOrder(o) {
      // DB 트리거(28번)와 같다: 삭제한 기록에는 새 주문을 만들지 않는다(질문 결제 주문만 허용 — 채팅은 이어진다)
      if (!o.productId.startsWith("cash-charge:") && assessments.get(o.assessmentId)?.recordDeletedAt) throw new Error("record_deleted");
      const all = [...orders.values()];
      const conflict =
        all.some((x) => x.orderNumber === o.orderNumber) ||
        all.some((x) => x.assessmentId === o.assessmentId && x.productId === o.productId && x.status === "pending");
      if (conflict) return { ok: false, reason: "conflict" };
      const { pricing, ...rest } = o;
      const record: OrderRecord = {
        ...rest,
        id: id(),
        status: "pending",
        provider: "tosspayments",
        listAmount: pricing?.listAmount ?? null,
        discountKrw: pricing?.discountKrw ?? null,
        discountKind: pricing?.discountKind ?? null,
        discountRef: pricing?.discountRef ?? null,
        paymentKey: null,
        method: null,
        approvedAt: null,
        failureCode: null,
        failureMessage: null,
        acquisition: o.acquisition ?? null,
        // 같은 시각에 여러 주문을 만들어도 순서가 구분되도록 1ms씩 더한다
        createdAt: new Date(now().getTime() + ++tick).toISOString(),
        updatedAt: iso(),
      };
      orders.set(record.id, record);
      return { ok: true, value: record };
    },
    async updateOrder(orderId, from, patch) {
      const current = orders.get(orderId);
      if (!current || !from.includes(current.status)) return null;
      if (patch.status && patch.status !== current.status && !canTransition(current.status, patch.status)) {
        throw new Error(`허용되지 않는 주문 상태 변경: ${current.status} → ${patch.status}`);
      }
      if (patch.status === "paid") {
        const otherPaid = [...orders.values()].some(
          (x) => x.id !== orderId && x.assessmentId === current.assessmentId && x.productId === current.productId && x.status === "paid",
        );
        if (otherPaid) throw Object.assign(new Error("duplicate paid order"), { code: "23505" });
      }
      const next = { ...current, ...patch, updatedAt: iso() };
      orders.set(orderId, next);
      onOrderChange(current, next);
      // 혜택 저장소 등이 주문 상태 변화에 반응한다(DB의 orders 트리거와 같은 자리) — 훅의 오류는 주문 상태 반영을 막지 않는다
      for (const hook of orderHooks) {
        try {
          hook(current, next);
        } catch {
          // DB 트리거와 같이 보상 처리 오류가 결제 확정을 막지 않는다
        }
      }
      return next;
    },
    async addPaymentEvent(event) {
      events.push({ orderId: event.orderId, source: event.source, status: event.status, detail: event.detail, createdAt: new Date(now().getTime() + ++tick).toISOString() });
    },
    async addFunnelEvent(e) {
      funnel.push({ ...e, id: funnel.length + 1, createdAt: new Date(now().getTime() + ++tick).toISOString() });
    },
    async listFunnelEventsSince(since, limit) {
      return funnel.filter((e) => e.createdAt >= since).sort((a, b) => b.id - a.id).slice(0, limit);
    },
    async listOrdersForMetrics(since, limit) {
      return [...orders.values()]
        .filter((o) => o.createdAt >= since)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((o) => ({ id: o.id, userId: o.userId, assessmentId: o.assessmentId, productId: o.productId, status: o.status, amount: o.amount, paymentEnv: o.paymentEnv, createdAt: o.createdAt, approvedAt: o.approvedAt, acquisition: o.acquisition ?? null, provider: o.provider, discountKind: o.discountKind ?? null, listAmount: o.listAmount ?? null, discountKrw: o.discountKrw ?? null }));
    },
    async listReportsForMetrics(since, limit) {
      return [...reports.values()]
        .filter((r) => r.createdAt >= since)
        .slice(0, limit)
        .map((r) => ({ id: r.id, orderId: r.orderId, status: r.status, createdAt: r.createdAt, readyAt: r.readyAt }));
    },
    async countAssessmentsAllSince(since) {
      return [...assessments.values()].filter((a) => a.createdAt >= since).length;
    },
    async upsertFeedback(f) {
      const report = reports.get(f.reportId);
      // DB 트리거와 같은 규칙: 완성된 리포트의 주인만
      if (!report || report.userId !== f.userId || report.status !== "ready") throw new Error("feedback only for the owner of a ready report");
      const prev = feedback.get(f.reportId);
      const t = new Date(now().getTime() + ++tick).toISOString();
      feedback.set(f.reportId, { reportId: f.reportId, userId: f.userId, rating: f.rating, createdAt: prev?.createdAt ?? t, updatedAt: t });
    },
    async getFeedback(reportId) {
      return feedback.get(reportId) ?? null;
    },
    async listFeedbackSince(since, limit) {
      return [...feedback.values()].filter((f) => f.createdAt >= since).slice(0, limit);
    },
    async countAssessmentsSince(userId, since) {
      return [...assessments.values()].filter((a) => a.userId === userId && a.createdAt >= since).length;
    },
    async addAiUsage(u) {
      aiUsage.push({ ...u, id: aiUsage.length + 1, createdAt: new Date(now().getTime() + ++tick).toISOString() });
    },
    async listAiUsageSince(since, limit) {
      return aiUsage.filter((u) => u.createdAt >= since).sort((a, b) => b.id - a.id).slice(0, limit);
    },
    async sumAiCostSince(since) {
      return aiUsage.filter((u) => u.createdAt >= since).reduce((n, u) => n + (u.estCostKrw ?? 0), 0);
    },
    async countActiveGenerations(staleBefore) {
      return [...reports.values()].filter((r) => r.status === "generating" && r.updatedAt >= staleBefore).length;
    },
    async countQueuedReports() {
      return [...reports.values()].filter((r) => r.status === "queued").length;
    },
    async addOpsEvent(e) {
      opsEvents.push({
        id: opsEvents.length + 1,
        createdAt: new Date(now().getTime() + ++tick).toISOString(),
        kind: e.kind,
        severity: e.severity ?? "info",
        orderNumber: e.orderNumber ?? null,
        errorId: e.errorId ?? null,
        dedupeKey: e.dedupeKey ?? null,
        message: e.message.slice(0, 500),
        detail: e.detail ?? {},
      });
    },
    async listOpsEvents(f) {
      return opsEvents
        .filter((e) => (!f.orderNumber || e.orderNumber === f.orderNumber) && (!f.errorId || e.errorId === f.errorId) && (!f.kinds || f.kinds.includes(e.kind)) && (!f.since || e.createdAt >= f.since))
        .sort((a, b) => b.id - a.id)
        .slice(0, f.limit);
    },
    async hasOpsEventSince(key, since) {
      return opsEvents.some((e) => e.dedupeKey === key && e.createdAt >= since);
    },
    async listOrdersForReconcile(o) {
      const all = [...orders.values()];
      // 혜택 주문(0원)은 결제사 기록이 없어 결제 대조에서 뺀다(DB 저장소와 같다)
      const pending = all.filter((x) => x.provider !== "benefit" && x.status === "pending" && x.createdAt < o.pendingCreatedBefore).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const paid = all.filter((x) => x.provider !== "benefit" && x.status === "paid" && (x.approvedAt ?? x.createdAt) >= o.paidSince);
      return [...pending, ...paid].slice(0, o.limit);
    },
    async listRecentOrders(limit) {
      return [...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },
    async getOrderById(orderId) {
      return orders.get(orderId) ?? null;
    },
    async listProblemReports(o) {
      return [...reports.values()]
        .filter((r) => o.statuses.includes(r.status) && (!o.updatedBefore || r.updatedAt < o.updatedBefore))
        .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))
        .slice(0, o.limit)
        .map(({ id, orderId, assessmentId, status, attempts, lastError, createdAt, updatedAt }) => ({ id, orderId, assessmentId, status, attempts, lastError, createdAt, updatedAt }));
    },
    async getContext(assessmentId) {
      return contexts.get(assessmentId) ?? null;
    },
    async listContexts(userId) {
      return [...contexts.values()].filter((c) => c.userId === userId).map(({ assessmentId, topic, updatedAt }) => ({ assessmentId, topic, updatedAt }));
    },
    async upsertContext(c) {
      // DB 트리거와 같은 규칙: 검사 결과의 주인만
      if (assessments.get(c.assessmentId)?.userId !== c.userId) throw new Error("personal context owner mismatch");
      const prev = contexts.get(c.assessmentId);
      const record: PersonalContext = { ...c, createdAt: prev?.createdAt ?? iso(), updatedAt: new Date(now().getTime() + ++tick).toISOString() };
      contexts.set(c.assessmentId, record);
      return record;
    },
    async deleteContext(assessmentId) {
      contexts.delete(assessmentId);
    },
    async insertConcernRecord(c) {
      // DB와 같은 규칙: 검사 결과의 주인만, 같은 작성 시점의 기록은 하나만 (내용을 지운 기록은 제외)
      if (assessments.get(c.assessmentId)?.userId !== c.userId) throw new Error("concern record owner mismatch");
      if ([...concernRecords.values()].some((x) => x.assessmentId === c.assessmentId && x.writtenAt === c.writtenAt && !x.scrubbedAt)) return { ok: false, reason: "conflict" };
      const record: ConcernRecord = { ...c, id: id(), createdAt: new Date(now().getTime() + ++tick).toISOString(), scrubbedAt: null };
      concernRecords.set(record.id, record);
      return { ok: true, value: record };
    },
    async insertCompatRequest(r) {
      // DB와 같은 규칙: 주문이 있어야 하고(주문 소유자 = 요청한 사람), 같은 주문에는 한 줄만
      const order = orders.get(r.orderId);
      if (!order || order.userId !== r.userId) throw new Error("compat request owner mismatch");
      if ([...compatRequests.values()].some((x) => x.orderId === r.orderId || x.id === r.id)) return { ok: false, reason: "conflict" };
      const record: CompatRequestRecord = { id: r.id, orderId: r.orderId, userId: r.userId, partner: r.partner, scrubbedAt: null, createdAt: new Date(now().getTime() + ++tick).toISOString() };
      compatRequests.set(record.id, record);
      return { ok: true, value: record };
    },
    async getCompatRequestByOrder(orderId) {
      return [...compatRequests.values()].find((x) => x.orderId === orderId) ?? null;
    },
    async scrubCompatRequest(orderId) {
      const c = [...compatRequests.values()].find((x) => x.orderId === orderId);
      if (!c || c.scrubbedAt) return false;
      compatRequests.set(c.id, { ...c, partner: null, scrubbedAt: new Date(now().getTime()).toISOString() });
      return true;
    },
    async getConcernRecord(recordId) {
      return concernRecords.get(recordId) ?? null;
    },
    async listConcernRecords(assessmentId) {
      return [...concernRecords.values()].filter((c) => c.assessmentId === assessmentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async listConcernRecordSummaries(userId) {
      return [...concernRecords.values()]
        .filter((c) => c.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ id, assessmentId, topic, writtenAt, createdAt, scrubbedAt }) => ({ id, assessmentId, topic, writtenAt, createdAt, scrubbedAt }));
    },
    async scrubConcernRecord(recordId, at) {
      const c = concernRecords.get(recordId);
      if (!c || c.scrubbedAt) return;
      concernRecords.set(recordId, { ...c, question: "", situation: "", matched: "", differed: "", excerpt: "", scrubbedAt: at });
    },
    async getTalkRoom(assessmentId, roomKey) {
      return talkRooms.get(`${assessmentId}|${roomKey}`) ?? null;
    },
    async listTalkRoomKeys(assessmentId) {
      return [...talkRooms.values()].filter((t) => t.assessmentId === assessmentId).map((t) => t.roomKey);
    },
    async upsertTalkRoom(input) {
      if (assessments.get(input.assessmentId)?.userId !== input.userId) throw new Error("talk room owner mismatch");
      if (assessments.get(input.assessmentId)?.recordPurgedAt) throw new Error("record_purged"); // DB 트리거(29번)와 같다: 삭제를 마친 기록에는 대화방을 만들거나 고치지 않는다
      // 이미 있는 방은 요약 위치(savedUpto)를 그대로 둔다 (DB의 upsert가 넣은 열만 바꾸는 것과 같다)
      const prev = talkRooms.get(`${input.assessmentId}|${input.roomKey}`);
      talkRooms.set(`${input.assessmentId}|${input.roomKey}`, { assessmentId: input.assessmentId, roomKey: input.roomKey, userId: input.userId, actions: input.actions, updatedAt: iso(), savedUpto: prev?.savedUpto ?? 0 });
    },
    async deleteTalkRoom(assessmentId, roomKey) {
      talkRooms.delete(`${assessmentId}|${roomKey}`);
    },
    async deleteTalkRoomsBefore(assessmentId, prefix, keepKey) {
      for (const [k, t] of [...talkRooms]) if (t.assessmentId === assessmentId && t.roomKey.startsWith(prefix) && t.roomKey < keepKey) talkRooms.delete(k);
    },
    async claimTalkRoomSegment(assessmentId, roomKey, from, to) {
      const k = `${assessmentId}|${roomKey}`;
      const t = talkRooms.get(k);
      if (!t || t.savedUpto !== from) return false;
      talkRooms.set(k, { ...t, savedUpto: to });
      return true;
    },
    async releaseTalkRoomSegment(assessmentId, roomKey, from, to) {
      const k = `${assessmentId}|${roomKey}`;
      const t = talkRooms.get(k);
      if (t && t.savedUpto === to) talkRooms.set(k, { ...t, savedUpto: from });
    },
    async insertChatSummary(input) {
      if (assessments.get(input.assessmentId)?.userId !== input.userId) throw new Error("chat summary owner mismatch");
      if (assessments.get(input.assessmentId)?.recordPurgedAt) throw new Error("record_purged");
      const row: ChatSummaryRecord = { id: id(), userId: input.userId, assessmentId: input.assessmentId, room: input.room, visible: input.visible, items: input.items, createdAt: iso() };
      chatSummaries.push(row);
      return row;
    },
    async listChatSummaries(userId, opts) {
      return chatSummaries
        .filter((s) => s.userId === userId && (!opts.visibleOnly || s.visible))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1))
        .slice(0, opts.limit ?? 500);
    },
    async listRoomChatSummaries(userId, assessmentId, room, limit) {
      return chatSummaries
        .filter((s) => s.userId === userId && s.assessmentId === assessmentId && s.room === room)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1))
        .slice(0, limit);
    },
    async countVisibleChatSummaries(userId) {
      return chatSummaries.filter((s) => s.userId === userId && s.visible).length;
    },
    async deleteChatSummary(userId, summaryId) {
      const i = chatSummaries.findIndex((s) => s.id === summaryId && s.userId === userId);
      if (i < 0) return false;
      chatSummaries.splice(i, 1);
      return true;
    },
    async deleteChatSummaries(userId) {
      let n = 0;
      for (let i = chatSummaries.length - 1; i >= 0; i--) {
        if (chatSummaries[i].userId !== userId) continue;
        chatSummaries.splice(i, 1);
        n++;
      }
      return n;
    },
    async deleteExpiredHiddenChatSummaries(before) {
      let n = 0;
      for (let i = chatSummaries.length - 1; i >= 0; i--) {
        if (chatSummaries[i].visible || chatSummaries[i].createdAt >= before) continue;
        chatSummaries.splice(i, 1);
        n++;
      }
      return n;
    },
    async trimHiddenChatSummaries(userId, assessmentId, room, keep) {
      const hidden = chatSummaries
        .filter((s) => s.userId === userId && s.assessmentId === assessmentId && s.room === room && !s.visible)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || (a.id < b.id ? 1 : -1));
      for (const old of hidden.slice(keep)) chatSummaries.splice(chatSummaries.indexOf(old), 1);
    },
    async addChatQuestion(input) {
      if (assessments.get(input.assessmentId)?.recordPurgedAt) throw new Error("record_purged");
      chatQuestions.push({ ...input, createdAt: iso() });
    },
    async countChatQuestionsSince(userId, since) {
      return chatQuestions.filter((q) => q.userId === userId && q.createdAt >= since).length;
    },
    async countChatQuestionsInRoom(userId, roomKey) {
      return chatQuestions.filter((q) => q.userId === userId && q.roomKey === roomKey).length + liveReservations(userId, roomKey);
    },
    async reserveChatQuestion({ userId, assessmentId, roomKey, max }) {
      // DB reserve_chat_question과 같은 규칙 — 확인과 예약이 한 번에(await 없이) 일어나 동시에 와도 한도를 넘지 않는다
      const nowMs = now().getTime();
      for (let i = chatReservations.length - 1; i >= 0; i--) if (chatReservations[i].userId === userId && chatReservations[i].until <= nowMs) chatReservations.splice(i, 1);
      if (assessments.get(assessmentId)?.recordPurgedAt) throw new Error("record_purged");
      const used = chatQuestions.filter((q) => q.userId === userId && q.roomKey === roomKey).length + liveReservations(userId, roomKey);
      if (used >= max) return null;
      const id = ++reservationSeq;
      chatReservations.push({ id, userId, assessmentId, roomKey, until: nowMs + 10 * 60_000 });
      return { id };
    },
    async confirmChatQuestion(reservation, input) {
      if (reservation.id !== null) {
        const i = chatReservations.findIndex((r) => r.id === reservation.id);
        if (i >= 0) chatReservations.splice(i, 1);
      }
      if (assessments.get(input.assessmentId)?.recordPurgedAt) throw new Error("record_purged");
      chatQuestions.push({ ...input, createdAt: iso() });
    },
    async releaseChatQuestion(reservation, input) {
      if (reservation.id === null) return;
      const i = chatReservations.findIndex((r) => r.id === reservation.id && r.userId === input.userId);
      if (i >= 0) chatReservations.splice(i, 1);
    },
    // 맛보기 리포트 — DB reserve_taste_report와 같은 규칙(한 회원 한 줄 · 예약 5분 · 확인과 예약이 한 번에)
    async getTasteReport(userId) {
      const r = tasteReports.get(userId);
      return r ? tasteRecord(r) : null;
    },
    async reserveTasteReport({ userId, assessmentId }) {
      const r = tasteReports.get(userId);
      const nowMs = now().getTime();
      // DB 트리거(28번)와 같다: 삭제한 기록으로는 맛보기 줄을 새로 만들거나 옮기지 않는다(이미 받은 줄을 돌려주는 것은 그대로)
      if ((!r || r.status !== "ready") && assessments.get(assessmentId)?.recordDeletedAt) throw new Error("record_deleted");
      if (r) {
        if (r.status === "ready") return { state: "ready", record: tasteRecord(r) };
        if (r.until !== null && r.until > nowMs) return { state: "busy" };
        r.assessmentId = assessmentId;
        r.until = nowMs + 5 * 60_000;
        return { state: "reserved" };
      }
      tasteReports.set(userId, { userId, assessmentId, status: "pending", content: null, generator: null, generatorVersion: null, createdAt: iso(), until: nowMs + 5 * 60_000 });
      return { state: "reserved" };
    },
    async saveTasteReport({ userId, assessmentId, content, generator, generatorVersion }) {
      const r = tasteReports.get(userId);
      // DB 트리거(28번)와 같다: 삭제한 기록의 맛보기 줄은 고칠 수 없다 — 늦게 도착한 생성 응답으로 글이 되살아나지 않는다
      if (assessments.get(assessmentId)?.recordDeletedAt) throw new Error("record_deleted");
      if (!r || r.assessmentId !== assessmentId || r.status !== "pending") throw new Error("taste_not_reserved");
      r.status = "ready";
      r.content = content;
      r.generator = generator;
      r.generatorVersion = generatorVersion;
      r.until = null;
    },
    async releaseTasteReport({ userId, assessmentId }) {
      const r = tasteReports.get(userId);
      if (r && r.assessmentId === assessmentId && r.status === "pending") tasteReports.delete(userId);
    },
    // 초대 링크 · 초대 할인
    async createInvite({ userId, assessmentId, token, tier }) {
      const mine = assessments.get(assessmentId);
      if (!mine || mine.userId !== userId) throw new Error("invite owner mismatch");
      const found = invites.get(assessmentId);
      if (found) return found;
      const record: InviteRecord = { id: id(), token, inviterUserId: userId, assessmentId, inviterTier: tier, createdAt: iso() };
      invites.set(assessmentId, record);
      return record;
    },
    async getInviteByAssessment(userId, assessmentId) {
      const found = invites.get(assessmentId);
      return found && found.inviterUserId === userId ? found : null;
    },
    async getInviteByToken(token) {
      return [...invites.values()].find((i) => i.token === token) ?? null;
    },
    async inviteDiscountStatus({ token, inviteeUserId, cap }) {
      const checked = inviteChecks(token, inviteeUserId, cap);
      if ("inv" in checked) return { ok: true, remaining: cap - liveDiscountCount(checked.inv.inviterUserId, inviteeUserId) };
      return checked;
    },
    async claimInviteDiscount({ token, inviteeUserId, orderId, cap }) {
      const inv = [...invites.values()].find((i) => i.token === token);
      if (!inv) return { ok: false, reason: "invalid" };
      const order = orders.get(orderId);
      if (inv.inviterTier === "deep" && inv.inviterUserId !== inviteeUserId && (!order || order.userId !== inviteeUserId || order.status !== "pending" || order.productId !== PERSONAL_REPORT.id)) {
        return { ok: false, reason: "order-mismatch" };
      }
      // 초대한 사람의 결제 대기 1시간 지난 할인 주문은 취소한다(확인 전에 정리 — DB와 같다)
      const checkedFirst = inviteChecks(token, inviteeUserId, Number.MAX_SAFE_INTEGER);
      if ("inv" in checkedFirst) {
        for (const d of discounts.values()) {
          if (d.inviterUserId !== inv.inviterUserId || d.inviteeUserId === inviteeUserId) continue;
          const o = orders.get(d.orderId);
          if (o && o.status === "pending" && now().getTime() - new Date(o.createdAt).getTime() >= 3600_000) orders.set(o.id, { ...o, status: "canceled", failureCode: "DISCOUNT_STALE", updatedAt: iso() });
        }
      }
      const checked = inviteChecks(token, inviteeUserId, cap);
      if (!("inv" in checked)) return checked;
      const own = discounts.get(inviteeUserId);
      if (own && own.orderId !== orderId) {
        const old = orders.get(own.orderId);
        if (old && old.status === "pending") orders.set(old.id, { ...old, status: "canceled", failureCode: "DISCOUNT_REPLACED", updatedAt: iso() });
      }
      discounts.set(inviteeUserId, { inviteeUserId, inviteId: inv.id, inviterUserId: inv.inviterUserId, orderId });
      return { ok: true, remaining: cap - liveDiscountCount(inv.inviterUserId, inviteeUserId) - 1 };
    },
    async countInviteDiscountsUsed(inviterUserId) {
      return liveDiscountCount(inviterUserId, "");
    },
    async getCashBalance(userId) {
      return wallets.get(userId) ?? 0;
    },
    async listCashLedger(userId, limit) {
      return ledger
        .filter((l) => l.userId === userId)
        .sort((a, b) => b.id - a.id)
        .slice(0, limit)
        .map(({ id: lid, kind, amount, orderId, shortfall, createdAt }) => ({ id: lid, kind, amount, orderId, shortfall, createdAt }));
    },
    async spendCash({ userId, amount, ref }) {
      if (!Number.isInteger(amount) || amount <= 0) throw new Error("cash_invalid_amount");
      if (ledger.some((l) => l.ref === ref && l.kind === "spend")) throw Object.assign(new Error("duplicate cash spend"), { code: "23505" });
      const balance = wallets.get(userId);
      if (balance === undefined || balance < amount) return null;
      wallets.set(userId, balance - amount);
      // 질문 한 개를 쓰는 것이면 가장 먼저 산 묶음 중 남은 질문이 있는 묶음에서 쓴다 (DB spend_cash와 같다)
      let packOrderId: string | null = null;
      if (amount === MIYU_CASH.perQuestion) {
        const pack = [...packs.values()]
          .filter((p) => p.userId === userId && packRemaining(p) > 0)
          .sort((a, b) => (a.purchasedAt < b.purchasedAt ? -1 : a.purchasedAt > b.purchasedAt ? 1 : a.orderId < b.orderId ? -1 : 1))[0];
        if (pack) {
          pack.used += 1;
          packOrderId = pack.orderId;
        }
      }
      addLedger({ userId, kind: "spend", amount: -amount, ref, packOrderId });
      return balance - amount;
    },
    async restoreCashSpend({ userId, ref }) {
      const spent = ledger.find((l) => l.userId === userId && l.ref === ref && l.kind === "spend");
      if (!spent) return null;
      let add = -spent.amount;
      const pack = spent.packOrderId ? packs.get(spent.packOrderId) : undefined;
      if (pack) {
        // 그 사이 이 묶음이 환불로 정산됐다면 되돌린 질문은 이미 환불에 포함된 것이라 지갑에 다시 넣지 않는다
        const before = packRemaining(pack);
        const after = packRemaining({ ...pack, used: Math.max(pack.used - 1, 0) });
        add = (after - before) * -spent.amount;
      }
      if (!addLedger({ userId, kind: "spend_restore", amount: add, ref, packOrderId: spent.packOrderId })) return null;
      if (pack) pack.used = Math.max(pack.used - 1, 0);
      const next = (wallets.get(userId) ?? 0) + add;
      wallets.set(userId, next);
      return next;
    },
    async getQuestionPack(orderId) {
      const p = packs.get(orderId);
      return p ? { ...p } : null;
    },
    async listOrdersWithOpenPacks({ userId, limit }) {
      return [...packs.values()]
        .filter((p) => (userId ? p.userId === userId : true) && packRemaining(p) > 0)
        .sort((a, b) => (a.purchasedAt < b.purchasedAt ? -1 : a.purchasedAt > b.purchasedAt ? 1 : 0))
        .map((p) => orders.get(p.orderId))
        .filter((o): o is OrderRecord => o !== undefined && o.status === "paid")
        .slice(0, limit)
        .map((o) => ({ ...o }));
    },
    async applyCashRefund({ orderId, canceledTotal }) {
      return applyRefund(orderId, canceledTotal);
    },
    async adminCreditQuestion(orderId) {
      // DB 함수 admin_credit_question과 같은 규칙: 주문 상태는 바꾸지 않고, 결제 완료인 질문 결제 주문에 빠진 충전만 한 번 넣는다
      const order = orders.get(orderId);
      if (!order) return "not-found";
      const cash = parseCashProductId(order.productId);
      if (!cash) return "not-cash";
      if (order.status !== "paid") return "not-paid";
      if (!wallets.has(order.userId)) wallets.set(order.userId, 0);
      let credited = false;
      if (cash.cash > 0 && addLedger({ userId: order.userId, kind: "charge", amount: cash.cash, orderId: order.id })) {
        wallets.set(order.userId, wallets.get(order.userId)! + cash.cash);
        ensurePack(order);
        credited = true;
      }
      if (cash.bonus > 0 && addLedger({ userId: order.userId, kind: "bonus", amount: cash.bonus, orderId: order.id })) {
        wallets.set(order.userId, wallets.get(order.userId)! + cash.bonus);
        credited = true;
      }
      return credited ? "credited" : "already";
    },
    async listPaymentEvents(orderId) {
      return events.filter((e) => e.orderId === orderId).map(({ source, status, detail, createdAt }) => ({ source, status, detail, createdAt }));
    },
    async getReportByOrder(orderId) {
      return [...reports.values()].find((r) => r.orderId === orderId) ?? null;
    },
    async listReportStatuses(userId) {
      return [...reports.values()]
        .filter((r) => r.userId === userId)
        .map((r) => ({ id: r.id, orderId: r.orderId, assessmentId: r.assessmentId, status: r.status, generator: r.generator, generatorVersion: r.generatorVersion, readyAt: r.readyAt }));
    },
    async insertReport(r) {
      // DB 트리거(28번)와 같다: 삭제한 기록에는 새 리포트 줄을 넣지 않는다(저장소가 "만들 수 없음"으로 돌려준다)
      if (assessments.get(r.assessmentId)?.recordDeletedAt) return { ok: false, reason: "conflict" };
      if ([...reports.values()].some((x) => x.orderId === r.orderId)) return { ok: false, reason: "conflict" };
      const record: ReportRecord = {
        ...r,
        id: id(),
        content: null,
        generator: null,
        generatorVersion: null,
        lastError: null,
        createdAt: iso(),
        updatedAt: iso(),
        readyAt: null,
      };
      reports.set(record.id, record);
      return { ok: true, value: record };
    },
    async updateReport(reportId, from, patch, expectedAttempts) {
      const current = reports.get(reportId);
      if (!current || !from.includes(current.status)) return null;
      if (expectedAttempts !== undefined && current.attempts !== expectedAttempts) return null;
      if (current.status === "ready") throw new Error("완성된 리포트는 바꿀 수 없습니다.");
      const next = { ...current, ...patch, updatedAt: iso() };
      reports.set(reportId, next);
      return next;
    },
  };

  return { repo, newId: id, orderHooks, withdrawHooks, compatRequests, profiles, regions, assessments, myDelete, transcripts, orders, reports, events, consents, contexts, concernRecords, talkRooms, chatQuestions, chatSummaries, opsEvents, aiUsage, funnel, feedback, wallets, ledger, packs, chatReservations };
}
