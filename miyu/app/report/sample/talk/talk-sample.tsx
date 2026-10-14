import { sampleRoomPath } from "@/components/talk/room-paths";
import { TalkView } from "@/components/talk/talk-view";
import { buildTalkModel } from "@/lib/report/reading/talk";
import { ROOM_ORDER, type RoomId } from "@/lib/report/reading/talk-room";
import { sampleReport } from "@/lib/samples/sample-report";
import { sampleReadingReport } from "@/lib/samples/sample-reading-report";

/** 가상 인물 서윤의 대화 예시 — 구매 없이 볼 수 있고, 실제 리포트도 같은 화면에서 읽는다 */
export function SampleTalk({ room }: { room: RoomId }) {
  const model = buildTalkModel(sampleReadingReport, { tendencyName: sampleReport.tendency.name });
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
