import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[SectionErrorBoundary]', this.props.label ?? 'section', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const { label } = this.props;
    return (
      <div className="rounded-xl border border-border bg-card p-6 sm:p-8 flex flex-col items-center justify-center text-center">
        <div className="w-10 h-10 rounded-full bg-[#ef4444]/12 flex items-center justify-center mb-3">
          <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1.5">
          Couldn’t load {label ?? 'this section'}
        </h3>
        <p className="text-[12px] text-muted-foreground max-w-sm mb-4">
          Something went wrong.
        </p>
        <button
          type="button"
          onClick={this.handleRetry}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12px] font-semibold bg-[#ef4444] text-white hover:bg-[#dc2626] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }
}
