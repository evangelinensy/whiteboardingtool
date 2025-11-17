"use client";

import { useEffect } from "react";

export default function MaterialLoader() {
  useEffect(() => {
    // Dynamically import Material Web components on client side only
    import("../material-setup");
  }, []);

  return null;
}
