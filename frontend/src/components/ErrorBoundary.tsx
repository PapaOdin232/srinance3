import React, { type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch() {
    // Możesz logować błędy do zewnętrznego serwisu
  }

  render() {
    if (this.state.hasError) {
      return <div style={{ color: 'red', padding: 16, background: '#fee' }}>
        <h2>Wystąpił błąd w komponencie.</h2>
        <pre>{this.state.error?.message}</pre>
      </div>;
    }
    return this.props.children;
  }
}
