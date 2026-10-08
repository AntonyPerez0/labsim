/**
 * Error boundaries. `ErrorBoundary` wraps a subtree and renders `fallback` (or a compact error card)
 * when it throws, so one broken panel — e.g. an app or drill another team is still building — never
 * takes the whole game UI down. `FatalScreen` is the full-page boot/crash screen.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LabWordmark } from '@/ui/kit';

interface Props {
  children: ReactNode;
  /** Shown instead of the subtree after an error. Receives a reset callback. */
  fallback?: (err: Error, reset: () => void) => ReactNode;
  /** Label for logs ("drill DR01", "computer"). */
  label?: string;
  /** Changing this key resets the boundary (e.g. the overlay kind). */
  resetKey?: string | number;
}

interface State {
  error: Error | null;
  key: string | number | undefined;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ui] ${this.props.label ?? 'component'} crashed`, error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="ui-crash" data-ui-interactive>
        <div className="ui-crash__title">Something in this panel broke</div>
        <div className="ui-crash__msg mono">{error.message}</div>
        <button type="button" className="k-btn k-btn--secondary k-btn--sm" onClick={this.reset}>
          Try again
        </button>
      </div>
    );
  }
}

export function FatalScreen({ title, message, stack }: { title: string; message: string; stack?: string | null }) {
  return (
    <div className="fatal" data-ui-interactive>
      <div className="fatal__card">
        <LabWordmark size={40} />
        <h1>{title}</h1>
        <p className="fatal__msg">{message}</p>
        {stack ? <pre className="fatal__stack">{stack}</pre> : null}
        <div className="row">
          <button type="button" className="k-btn k-btn--primary" onClick={() => location.reload()}>
            Reload LabSim
          </button>
          <span className="muted">Your progress is saved in this browser.</span>
        </div>
      </div>
    </div>
  );
}
