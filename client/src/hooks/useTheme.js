import { useState, useEffect, useCallback } from "react";

const LS_KEY = "pi-web-ui-theme";

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(LS_KEY) || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(LS_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "light" ? "dark" : "light"));
  }, []);

  return [theme, toggle];
}
