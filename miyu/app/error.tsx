"use client";

import { ErrorView } from "@/components/site/error-view";

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorView digest={error.digest} retry={retry} />;
}
