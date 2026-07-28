import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted fonts (Fontsource) — bundled locally, no third-party requests.
import "@fontsource-variable/fraunces";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/spline-sans-mono";
import "./index.css";
import App from "./App";
import { ToastProvider } from "./hooks/useToasts";
import { ErrorBoundary } from "./components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>
);
