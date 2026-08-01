"use client";

import { useEffect } from "react";

export default function ScrollToTarget({ targetId }: { targetId?: string }) {
  useEffect(() => {
    if (!targetId) return;
    document.getElementById(`msg-${targetId}`)?.scrollIntoView({ block: "center" });
  }, [targetId]);
  return null;
}
