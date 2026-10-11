import type { Metadata } from "next";
import { TestFlow } from "./test-flow";

export const metadata: Metadata = {
  title: "검사 · 미유",
};

export default function TestPage() {
  return <TestFlow />;
}
