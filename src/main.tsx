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
import { StaleDeploymentBanner } from "./components/StaleDeploymentBanner";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          {/* Above everything: on a pinned deployment you're stuck at the
              sign-in screen too, with nothing explaining why. */}
          <div style={{ maxWidth: 1080, margin: "0 auto", padding: "12px 16px 0" }}>
            <StaleDeploymentBanner />
          </div>
          <Root />
          {/* Outside Root so it shows on the sign-in and pending screens too. */}
          <UpdateBanner />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
