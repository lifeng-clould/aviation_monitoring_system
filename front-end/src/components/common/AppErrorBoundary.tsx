import React from "react";

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export default class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: undefined
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message
    };
  }

  componentDidUpdate(prevProps: AppErrorBoundaryProps) {
    if (prevProps.children !== this.props.children && this.state.hasError) {
      this.setState({ hasError: false, message: undefined });
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="app-error-stage">
        <div className="app-error-panel">
          <span className="section-kicker">系统兜底</span>
          <h2>当前工作面加载失败</h2>
          <p>{this.state.message || "页面模块未能正确渲染，系统已阻止整页白屏。"}</p>
          <button type="button" onClick={() => window.location.reload()}>
            重新加载当前页面
          </button>
        </div>
      </div>
    );
  }
}
