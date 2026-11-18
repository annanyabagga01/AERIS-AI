import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'An unexpected interface error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#060A13] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full aeris-panel rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-rose-300">
              Application Recovery Needed
            </h2>
            <p className="text-sm text-slate-300 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-colors"
            >
              Reload AERIS AI
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
