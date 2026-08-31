import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import ar from "./ar";
import en from "./en";

type Messages = typeof en;
type Language = "ar" | "en";

const dictionaries: Record<Language, Messages> = { ar: ar as unknown as Messages, en };

function getNested(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

type I18nContextValue = {
  lang: Language;
  dir: "rtl" | "ltr";
  t: (path: string, params?: Record<string, string | number>) => string;
  setLanguage: (lang: Language) => void;
  statusLabel: (value: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    const stored = localStorage.getItem("app.language") as Language | null;
    if (stored === "en" || stored === "ar") return stored;
    return "ar";
  });

  const setLanguage = useCallback((next: Language) => {
    setLangState(next);
    localStorage.setItem("app.language", next);
  }, []);

  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const t = useCallback(
    (path: string, params?: Record<string, string | number>): string => {
      const primary = getNested(dictionaries[lang], path);
      if (typeof primary === "string") return interpolate(primary, params);
      const fallback = getNested(dictionaries.en, path);
      if (typeof fallback === "string") return interpolate(fallback, params);
      return path;
    },
    [lang]
  );

  const statusLabel = useCallback(
    (value: string): string => {
      const key = `status.${value}`;
      const translated = getNested(dictionaries[lang], key);
      if (typeof translated === "string") return translated;
      const fb = getNested(dictionaries.en, key);
      if (typeof fb === "string") return fb;
      return value;
    },
    [lang]
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, dir, t, setLanguage, statusLabel }), [lang, dir, t, setLanguage, statusLabel]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export function useT(): I18nContextValue["t"] {
  return useI18n().t;
}
