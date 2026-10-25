"use client";

import { RequireAuth } from "@/lib/client/require-auth";
import { RecapView } from "../_workspace/recap-view";

export default function RecapPage() {
  return (
    <RequireAuth>
      <RecapView />
    </RequireAuth>
  );
}
