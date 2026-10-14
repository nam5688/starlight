import { connection } from "next/server";
import { sampleRoomPath, sampleTastePath } from "@/components/talk/room-paths";
import { TalkView } from "@/components/talk/talk-view";
import { ASSESSMENT_MODULES } from "@/lib/assessment/modules";
import { buildDevFreeSummary } from "@/lib/report/build-free-summary";
import { buildFreePreview } from "@/lib/report/preview";
import { seoulReference } from "@/lib/report/reference";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { buildFreeTalkModel } from "@/lib/report/reading/talk-free";
import { ROOM_ORDER, type RoomId } from "@/lib/report/reading/talk-room";
import { seoulDate } from "@/lib/saju/interpret/day-plain";
import { sampleReport, SAMPLE_CHART } from "@/lib/samples/sample-report";
import { sampleReadingReport } from "@/lib/samples/sample-reading-report";

/** 무료 맛보기 예시에서 가상 인물이 고른 응답 — 모두 "그렇다"(확인추구형으로 읽히는 예시) */
const SAMPLE_ANSWERS = Object.fromEntries(ASSESSMENT_MODULES.flatMap((m) => m.items.map((item) => [item.id, 5])));

/**
 * 가상 인물 서윤의 대화 예시 — 구매 없이 볼 수 있고, 실제 리포트도 같은 화면에서 읽는다. 오늘의 한 장은 오늘 날짜로 계산하므로 요청 때마다 만든다.
 * tier "free": 서윤이 무료 분석만 마쳤을 때의 맛보기(잠긴 내용 없음 + 리포트로 이어지는 잠금 안내).
 */
export async function SampleTalk({ room, tier = "paid" }: { room: RoomId; tier?: "paid" | "free" }) {
  await connection();
  const now = new Date();
  const today = seoulDate(now);
  if (tier === "free") {
    const model = buildFreeTalkModel({
      name: "서윤",
      preview: buildFreePreview({ summary: buildDevFreeSummary(SAMPLE_ANSWERS), saju: SAMPLE_CHART, reference: seoulReference(now) }),
      saju: SAMPLE_CHART,
      today,
      href: "/analyze",
      owned: false,
      chat: { state: "locked" },
    });
    return (
      <TalkView
        model={model}
        room={room}
        scope="sample-free"
        dateLabel="예시"
        reportHref="/report/sample"
        dataHref="/report/sample"
        roomHrefs={Object.fromEntries(ROOM_ORDER.map((r) => [r, sampleTastePath(r)]))}
        badge={{ label: "무료 맛보기 예시", text: "가상 인물이 무료 분석만 마쳤을 때의 맛보기 예시예요. 실제 검사 · 만세력 계산 결과가 아니에요. 잠긴 내용은 리포트에서 이어져요." }}
      />
    );
  }
  const model = buildTalkModel(sampleReadingReport, { tendencyName: sampleReport.tendency.name, saju: SAMPLE_CHART, today, chat: { state: "pending" } });
  return (
    <TalkView
      model={model}
      room={room}
      scope="sample"
      dateLabel="예시"
      reportHref="/report/sample"
      dataHref="/report/sample#data"
      roomHrefs={Object.fromEntries(ROOM_ORDER.map((r) => [r, sampleRoomPath(r)]))}
      badge={{ label: "개발용 예시", text: "개발용 샘플 · 가상 인물 예시예요. 실제 검사 · 만세력 계산 결과가 아니에요." }}
    />
  );
}
