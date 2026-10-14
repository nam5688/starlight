"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { TalkCard } from "@/lib/report/reading/talk";
import { renderCardPng } from "./card-image";

const FILE_SAVE = "miyu-analysis-card.png"; // 파일 이름은 영문으로 둔다 (한글 이름이 일부 브라우저에서 사라진다)
const FILE_SHARE = "miyu-analysis-card-share.png";

type Share = { url: string; blob: Blob; includeName: boolean };

/**
 * [이미지 저장] [분석 자료 보기] + 작은 글자 [공유용 카드 만들기] — 이미지는 이 기기 안에서 만들어지며 서버로 보내지 않는다.
 * 공유용은 이름 · 분석일 · 사용한 정보를 빼고(이름은 고르면 넣는다), 생년월일 · 고민은 카드에 원래 없다.
 */
export function CardActions({ card, name, dateLabel, dataHref }: { card: TalkCard; name: string; dateLabel: string; /** 리포트의 "내 분석 데이터"(원국 · 오행 · 응답 환산값) 위치 */ dataHref: string }) {
  const [busy, setBusy] = useState<"save" | "share" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [share, setShare] = useState<Share | null>(null);
  const [includeName, setIncludeName] = useState(false);
  const urlRef = useRef<string | null>(null);

  // 미리보기 주소는 바꾸거나 화면을 떠날 때 정리한다
  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  const download = (blob: Blob, file: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const save = async () => {
    setBusy("save");
    setMessage(null);
    try {
      const blob = await renderCardPng(card, { variant: "save", name, dateLabel });
      download(blob, FILE_SAVE);
      setMessage("이미지를 저장했어요. 다운로드 폴더(또는 사진첩)를 확인해 보세요.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "이미지를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const makeShare = async (withName: boolean) => {
    setBusy("share");
    setMessage(null);
    try {
      const blob = await renderCardPng(card, { variant: "share", name, includeName: withName });
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setShare({ url, blob, includeName: withName });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "이미지를 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setBusy(null);
    }
  };

  const canShareFile = typeof navigator !== "undefined" && typeof navigator.canShare === "function" && typeof File !== "undefined";
  const shareFile = async () => {
    if (!share) return;
    const file = new File([share.blob], FILE_SHARE, { type: "image/png" });
    try {
      if (canShareFile && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], title: "ME:U 미유 분석 카드" });
      else download(share.blob, FILE_SHARE);
    } catch {
      // 공유 창을 닫은 경우 — 따로 알리지 않는다
    }
  };

  const btn = "inline-flex h-11 items-center justify-center rounded-full bg-accent-soft px-4 text-[15px] font-semibold text-accent-strong transition-colors hover:brightness-95 disabled:cursor-wait disabled:opacity-60";
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy !== null} className={btn}>
          {busy === "save" ? "만드는 중…" : "이미지 저장"}
        </button>
        <Link href={dataHref} className={btn}>
          분석 자료 보기
        </Link>
      </div>
      <button type="button" onClick={() => makeShare(includeName)} disabled={busy !== null} className="mt-1 inline-flex min-h-11 items-center px-1 text-[14px] font-semibold text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent disabled:cursor-wait disabled:opacity-60">
        {busy === "share" ? "만드는 중…" : "공유용 카드 만들기"}
      </button>
      {message && (
        <p role="status" className="mt-2 text-[14px] leading-[1.6] text-ink-2">
          {message}
        </p>
      )}
      {share && (
        <div className="mt-3 rounded-2xl bg-canvas p-3 shadow-soft">
          <p className="text-[14px] leading-[1.6] text-ink-2">공유용 카드예요. 생년월일과 고민은 들어 있지 않고, 이름과 분석일도 기본으로 뺐어요.</p>
          {/* 이미지는 이 기기 안에서 만든 임시 주소라 next/image를 쓰지 않는다 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={share.url} alt="공유용 분석 카드 미리보기" className="mt-3 w-full max-w-[360px] rounded-lg border border-line" />
          <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px]">
            <input
              type="checkbox"
              className="size-5 cursor-pointer accent-accent"
              checked={includeName}
              disabled={busy !== null}
              onChange={(e) => {
                setIncludeName(e.target.checked);
                void makeShare(e.target.checked);
              }}
            />
            카드에 이름 넣기
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => download(share.blob, FILE_SHARE)} className={btn}>
              공유용 이미지 저장
            </button>
            {canShareFile && (
              <button type="button" onClick={shareFile} className={btn}>
                공유하기
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
