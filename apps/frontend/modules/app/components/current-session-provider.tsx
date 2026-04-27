"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CurrentUserSessionResponse } from "@reward/shared-types/auth";

const CurrentSessionContext = createContext<CurrentUserSessionResponse | null>(
  null,
);

export function CurrentSessionProvider({
  value,
  children,
}: {
  value: CurrentUserSessionResponse;
  children: ReactNode;
}) {
  return (
    <CurrentSessionContext.Provider value={value}>
      {children}
    </CurrentSessionContext.Provider>
  );
}

export function useCurrentUserSession() {
  const value = useContext(CurrentSessionContext);
  if (!value) {
    throw new Error(
      "useCurrentUserSession must be used within CurrentSessionProvider",
    );
  }
  return value;
}
