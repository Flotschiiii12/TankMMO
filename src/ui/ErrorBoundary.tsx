import React from 'react';
import { tr } from '../i18n.ts';
import { Button } from './kit/Button.tsx';

interface ErrorBoundaryState { failed: boolean }

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="tt-screen" role="alert">
        <div className="tt-wrap" style={{ gridTemplateColumns: 'minmax(0, 1fr)', maxWidth: 420 }}>
          <section className="tt-card">
            <h1>{tr('Something went wrong.')}</h1>
            <p className="tt-muted tt-critical-message">{tr('The game ran into an unexpected error. Reload to continue.')}</p>
            <Button variant="primary" large onClick={() => window.location.reload()}>{tr('Reload game')}</Button>
          </section>
        </div>
      </main>
    );
  }
}
