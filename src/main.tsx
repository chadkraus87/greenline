import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Self-hosted fonts (Fontsource) — bundled locally, no third-party requests.
import "@fontsource-variable/fraunces";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/spline-sans-mono";
import "./index.css";
import { Root } from "./Root";
import { ToastProvider } from "./hooks/useToasts";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthProvider } from "./auth/AuthProvider";
import { UpdateBanner } from "./components/UpdateBanner";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <Root />
          {/* Outside Root so it shows on the sign-in and pending screens too. */}
          <UpdateBanner />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
