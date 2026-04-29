"use client";

import { useEffect, useState } from "react";

import { getBrowserDeviceFingerprint } from "@/lib/device-fingerprint";

export function RegisterDeviceFingerprintField() {
  const [fingerprint, setFingerprint] = useState("");

  useEffect(() => {
    let cancelled = false;

    void getBrowserDeviceFingerprint().then((value) => {
      if (!cancelled && value) {
        setFingerprint(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <input
      type="hidden"
      name="deviceFingerprint"
      value={fingerprint}
      readOnly
    />
  );
}
