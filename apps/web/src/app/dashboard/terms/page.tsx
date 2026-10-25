"use client";

import { RequireAuth } from "@/lib/client/require-auth";
import { TermsView } from "../_workspace/terms-view";

export default function TermsPage() {
  return (
    <RequireAuth>
      <TermsView />
    </RequireAuth>
  );
}
