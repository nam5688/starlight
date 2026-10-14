import { notFound, redirect } from "next/navigation";

/** 개발용 — 결과 폴더 주소만 열었을 때 막다른 길(404)이 되지 않도록 목록으로 보낸다 */
export default function DevCompareRunPage() {
  if (process.env.NODE_ENV === "production") notFound();
  redirect("/dev/compare");
}
