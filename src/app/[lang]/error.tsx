"use client";

import { useEffect } from "react";
import { useT } from "@/i18n/client";
import { Button } from "@/components/ui";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  // Never render error.message: in production it may contain internals.
  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <h1 className="text-2xl font-bold">{t.error.title}</h1>
      <p className="mt-2 text-slate-600">{t.error.body}</p>
      {error.digest && <p className="mt-1 num text-xs text-slate-400">{t.error.reference(error.digest)}</p>}
      <Button className="mt-6" onClick={() => reset()}>
        {t.error.retry}
      </Button>
    </div>
  );
}
