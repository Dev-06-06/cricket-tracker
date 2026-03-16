import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-[#0d1117] flex flex-col 
            items-center justify-center px-6 text-center"
          style={{ fontFamily: "'DM Sans', sans-serif" }}
        >
          <p className="text-4xl mb-4">🏏</p>
          <p className="text-sm font-black uppercase tracking-widest 
            text-[#f97316] mb-2">
            Something went wrong
          </p>
          <p className="text-sm text-slate-500 mb-6 max-w-sm">
            The scorer crashed unexpectedly. Your match data is safe.
          </p>
          <button
            type="button"
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="rounded-xl bg-[#f97316] px-6 py-3 text-sm 
              font-black uppercase tracking-widest text-white 
              hover:bg-orange-500 transition-all"
          >
            Reload Scorer
          </button>
          {this.state.error && (
            <p className="mt-4 text-[11px] text-slate-700 
              font-mono max-w-sm break-all">
              {this.state.error.message}
            </p>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}
