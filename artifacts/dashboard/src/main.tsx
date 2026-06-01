import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global interceptor — adds x-api-key to all non-POST /api/ requests
const _API_KEY = (import.meta as Record<string,any>).env?.VITE_API_SECRET ?? "";
const _origFetch = window.fetch.bind(window);
(window as typeof window).fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input
    : input instanceof URL ? input.toString()
    : (input as Request).url;
  const isApi = url.includes("/api/");
  const method = (init?.method ?? "GET").toUpperCase();
  if (isApi && method !== "POST") {
    init = { ...init, headers: { ...(init?.headers ?? {}), "x-api-key": _API_KEY } };
  }
  return _origFetch(input, init);
};

createRoot(document.getElementById("root")!).render(<App />);
