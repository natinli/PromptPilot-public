/**
 * React Error Boundary —— 捕获 React 组件树中的渲染错误
 * 
 * 功能：
 * - 捕获子组件树中的 JS 错误，防止整个应用崩溃
 * - 将错误推送到 Debug 面板的「错误」Tab（开发模式）
 * - 显示降级 UI：错误信息 + 重试按钮 + 返回首页按钮
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { pushErrorLog } from "./debug-store";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class DebugErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 推送到 Debug 面板（开发模式下 pushErrorLog 会被面板消费）
    pushErrorLog({
      type: "react-error",
      message: error.message || "React 组件渲染错误",
      stack: [
        error.stack || "",
        "\n--- React 组件栈 ---\n",
        errorInfo.componentStack || "",
      ].join(""),
    });

    // 同时输出到控制台
    console.error("[DebugErrorBoundary] 捕获到 React 错误:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    // 使用 window.location 导航到首页，确保完全重置状态
    window.location.hash = "";
    window.location.pathname = "/mini";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
          <h2 className="text-lg font-semibold text-gray-200 mb-2">
            页面渲染出错了
          </h2>
          <p className="text-sm text-gray-400 mb-1 max-w-md">
            {this.state.error?.message || "发生了未知错误"}
          </p>
          {import.meta.env.DEV && this.state.error?.stack && (
            <pre className="text-[11px] text-red-300/60 bg-red-500/10 rounded-lg p-3 mt-3 max-w-lg max-h-32 overflow-auto text-left whitespace-pre-wrap break-all">
              {this.state.error.stack.slice(0, 500)}
            </pre>
          )}
          <div className="flex gap-3 mt-6">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-2 rounded-lg bg-blue-600/80 hover:bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              重试
            </button>
            <button
              onClick={this.handleGoHome}
              className="flex items-center gap-2 rounded-lg bg-gray-700/80 hover:bg-gray-700 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              <Home className="h-4 w-4" />
              返回首页
            </button>
          </div>
          {import.meta.env.DEV && (
            <p className="text-[10px] text-gray-600 mt-4">
              💡 按 F8 打开 Debug 面板查看详细错误信息
            </p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
