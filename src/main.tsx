import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { RestAlertLifecycle } from "./WorkoutClocks";
import { isAndroid } from "./native";
import { HealthLifecycle } from "./healthConnect";
if (isAndroid()) {
  document.documentElement.classList.add("native-android");
  window.addEventListener("neoform:android-back", () => {
    const close = document.querySelector<HTMLButtonElement>(
      "dialog[open] .modal-view:not([hidden]) [data-sheet-close]",
    );
    if (close) close.click();
    else if (
      document.activeElement instanceof HTMLElement &&
      document.activeElement.matches("input,textarea,select")
    )
      document.activeElement.blur();
    else window.dispatchEvent(new CustomEvent("neoform:home"));
  });
}
import "./styles.css";
import "./v2.css";
import "./workouts.css";
import "./reference-ui.css";
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="auth-wrap">
        <h1>Something interrupted this view.</h1>
        <p>Your saved draft stays on this device. Reload to recover it.</p>
        <button onClick={() => location.reload()}>Reload NEOFORM</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <HealthLifecycle />
    <RestAlertLifecycle />
    <App />
  </Boundary>,
);
if (!isAndroid() && "serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* shell still works without installation */
    });
  });
