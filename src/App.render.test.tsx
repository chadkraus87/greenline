// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import App from "./App";
import { ToastProvider } from "./hooks/useToasts";

beforeAll(() => {
  // jsdom lacks ResizeObserver (used by recharts if Reports mounted) and matchMedia
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
});

describe("App (render smoke, jsdom + fake-indexeddb)", () => {
  it("boots, seeds the DB, and renders the dashboard", async () => {
    render(<ToastProvider><App /></ToastProvider>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Greenline" })).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText("Cash runway")).toBeTruthy();
    expect(screen.getByText("Expected income")).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Bills/ })).toBeTruthy();
    cleanup();
  });
});
