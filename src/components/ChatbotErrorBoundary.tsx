import React, { createContext, useContext } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  WifiOff,
  X,
} from 'lucide-react';
import {
  classifyChatbotError,
  type ChatbotErrorDescriptor,
} from '../lib/chatbotErrors.ts';

export interface ChatbotErrorContextValue {
  activeError: ChatbotErrorDescriptor | null;
  reportError: (
    descriptor: ChatbotErrorDescriptor,
    retryHandler?: () => void
  ) => void;
  clearError: () => void;
}

const noopContext: ChatbotErrorContextValue = {
  activeError: null,
  reportError: () => {},
  clearError: () => {},
};

const ChatbotErrorContext =
  createContext<ChatbotErrorContextValue>(noopContext);

export function useChatbotError(): ChatbotErrorContextValue {
  return useContext(ChatbotErrorContext);
}

interface ChatbotErrorBoundaryProps {
  children: React.ReactNode;
  resetKey?: string;
}

interface ChatbotErrorBoundaryState {
  hasRenderError: boolean;
  renderError: ChatbotErrorDescriptor | null;
  apiError: ChatbotErrorDescriptor | null;
  remountNonce: number;
}

/**
 * Centralized error boundary for the AERIS AI chatbot.
 * - Catches React render/lifecycle crashes inside the chatbot without breaking the rest of the app.
 * - Provides a centralized context channel (`useChatbotError`) so async API, network, timeout,
 *   quota, and configuration errors are always displayed gracefully with Retry / Dismiss controls.
 */
export class ChatbotErrorBoundary extends React.Component<
  ChatbotErrorBoundaryProps,
  ChatbotErrorBoundaryState
> {
  private retryHandler: (() => void) | null = null;

  constructor(props: ChatbotErrorBoundaryProps) {
    super(props);
    this.state = {
      hasRenderError: false,
      renderError: null,
      apiError: null,
      remountNonce: 0,
    };
  }

  static getDerivedStateFromError(
    error: Error
  ): Partial<ChatbotErrorBoundaryState> {
    return {
      hasRenderError: true,
      renderError: classifyChatbotError({ error }),
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[AERIS ChatbotErrorBoundary] Caught render error:', {
      name: error?.name || 'Error',
      message: error?.message || String(error),
      componentStack: errorInfo?.componentStack?.slice(0, 500) || null,
    });
  }

  componentDidUpdate(prevProps: ChatbotErrorBoundaryProps): void {
    if (prevProps.resetKey !== this.props.resetKey) {
      if (this.state.hasRenderError || this.state.apiError) {
        this.retryHandler = null;
        this.setState({
          hasRenderError: false,
          renderError: null,
          apiError: null,
        });
      }
    }
  }

  private handleReportError = (
    descriptor: ChatbotErrorDescriptor,
    retryHandler?: () => void
  ): void => {
    this.retryHandler = retryHandler ?? null;
    this.setState({ apiError: descriptor });
  };

  private handleClearError = (): void => {
    this.retryHandler = null;
    if (this.state.apiError) {
      this.setState({ apiError: null });
    }
  };

  private handleResetChatbot = (): void => {
    this.retryHandler = null;
    this.setState((prev) => ({
      hasRenderError: false,
      renderError: null,
      apiError: null,
      remountNonce: prev.remountNonce + 1,
    }));
  };

  private handleRetryApiError = (): void => {
    const fn = this.retryHandler;
    this.retryHandler = null;
    this.setState({ apiError: null });
    if (fn) {
      fn();
    }
  };

  render(): React.ReactNode {
    const { hasRenderError, renderError, apiError, remountNonce } = this.state;

    if (hasRenderError) {
      const descriptor =
        renderError ??
        classifyChatbotError({
          error: new Error('Unexpected chatbot rendering error.'),
        });
      return (
        <section
          role="alert"
          aria-live="assertive"
          data-testid="chatbot-error-boundary-fallback"
          className="aeris-panel rounded-xl p-6 border border-rose-500/35 bg-rose-500/5 space-y-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-rose-200">
                AERIS AI Assistant Encountered an Error
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                {descriptor.message}
              </p>
              <p className="text-[11px] text-slate-400">
                Other AERIS AI tabs remain unaffected. Reset the chatbot to
                start a clean session.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={this.handleResetChatbot}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Chatbot</span>
            </button>
          </div>
        </section>
      );
    }

    const contextValue: ChatbotErrorContextValue = {
      activeError: apiError,
      reportError: this.handleReportError,
      clearError: this.handleClearError,
    };

    return (
      <ChatbotErrorContext.Provider value={contextValue}>
        <div className="space-y-4">
          {apiError && (
            <div
              role="alert"
              aria-live="assertive"
              data-testid="chatbot-central-error-banner"
              className="rounded-xl bg-rose-500/12 border border-rose-500/40 p-4 text-xs text-rose-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {apiError.category === 'network' ? (
                  <WifiOff className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                )}
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold text-rose-200">
                    {apiError.title}
                  </p>
                  <p className="text-rose-200/90 leading-relaxed break-words">
                    {apiError.message}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {apiError.retryable && this.retryHandler && (
                  <button
                    type="button"
                    onClick={this.handleRetryApiError}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/25 border border-rose-400/50 text-rose-50 font-medium hover:bg-rose-500/35 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={this.handleClearError}
                  aria-label="Dismiss chatbot error"
                  className="p-1.5 rounded-lg text-rose-200 hover:bg-rose-500/20 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <React.Fragment key={remountNonce}>
            {this.props.children}
          </React.Fragment>
        </div>
      </ChatbotErrorContext.Provider>
    );
  }
}
