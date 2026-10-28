import {
  Component,
  createElement,
  lazy,
  Suspense,
  useMemo,
  useState,
  type ComponentType,
  type ComponentProps,
  type ReactNode,
} from "react";

class ViewLoadError extends Error {}
class ViewBoundary extends Component<
  { children: ReactNode; retry: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (!(this.state.error instanceof ViewLoadError)) throw this.state.error;
    return (
      <div className="sheet-loading" role="alert">
        <p>This view couldn’t load. Check your connection and try again.</p>
        <button className="btn" onClick={this.props.retry}>
          Retry opening view
        </button>
      </div>
    );
  }
}

// Failed imports stay local to this view. Parent sheets and their input stay mounted.
export function deferredView<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return function DeferredView(props: ComponentProps<T>) {
    const [attempt, setAttempt] = useState(0);
    const View = useMemo(
      () =>
        lazy(() =>
          load().catch(() => {
            throw new ViewLoadError();
          }),
        ),
      [attempt],
    );
    return (
      <ViewBoundary key={attempt} retry={() => setAttempt((n) => n + 1)}>
        <Suspense
          fallback={
            <p className="sheet-loading" role="status">
              Opening…
            </p>
          }
        >
          {createElement(View, props)}
        </Suspense>
      </ViewBoundary>
    );
  };
}
