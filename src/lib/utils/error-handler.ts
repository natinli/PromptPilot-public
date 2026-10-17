export enum ErrorCode {
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
  TIMEOUT = "TIMEOUT",
  INVALID_API_KEY = "INVALID_API_KEY",
  EMPTY_INPUT = "EMPTY_INPUT",
  MODEL_UNAVAILABLE = "MODEL_UNAVAILABLE",
  NETWORK_ERROR = "NETWORK_ERROR",
  SAVE_FAILED = "SAVE_FAILED",
  DB_UNAVAILABLE = "DB_UNAVAILABLE",
  UNKNOWN = "UNKNOWN",
}

const errorMessages: Record<ErrorCode, string> = {
  [ErrorCode.QUOTA_EXCEEDED]: "今日优化额度已用完，请稍后再试。",
  [ErrorCode.TIMEOUT]: "模型响应超时，请稍后再试。",
  [ErrorCode.INVALID_API_KEY]: "API Key 无效，请检查配置。",
  [ErrorCode.EMPTY_INPUT]: "请先输入需要优化的内容。",
  [ErrorCode.MODEL_UNAVAILABLE]:
    "当前模型暂时不可用，系统已切换到备用模型。",
  [ErrorCode.NETWORK_ERROR]: "网络连接失败，请检查网络或代理设置（Gemini API 需要外网访问）。",
  [ErrorCode.SAVE_FAILED]: "保存失败，请稍后再试。",
  [ErrorCode.DB_UNAVAILABLE]: "数据库暂时不可用，请稍后再试。",
  [ErrorCode.UNKNOWN]: "发生未知错误，请稍后再试。",
};

export function classifyError(error: unknown): ErrorCode {
  const message =
    error instanceof Error ? error.message : String(error);

  if (message.includes("429") || message.includes("quota")) {
    return ErrorCode.QUOTA_EXCEEDED;
  }
  if (message.includes("timeout") || message.includes("TIMEOUT")) {
    return ErrorCode.TIMEOUT;
  }
  if (
    message.includes("401") ||
    /\b400\b/.test(message) ||
    message.includes("API key") ||
    message.includes("API_KEY_INVALID") ||
    message.includes("INVALID_ARGUMENT")
  ) {
    return ErrorCode.INVALID_API_KEY;
  }
  if (message.includes("503") || message.includes("unavailable")) {
    return ErrorCode.MODEL_UNAVAILABLE;
  }
  if (
    message.includes("fetch failed") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ECONNRESET") ||
    message.includes("network") ||
    message.includes("Failed to fetch") ||
    message.includes("getaddrinfo")
  ) {
    return ErrorCode.NETWORK_ERROR;
  }
  if (message.includes("404") || message.includes("not found")) {
    return ErrorCode.MODEL_UNAVAILABLE;
  }

  return ErrorCode.UNKNOWN;
}

export function getErrorMessage(code: ErrorCode): string {
  return errorMessages[code];
}

export function getUserFriendlyMessage(error: unknown): string {
  const code = classifyError(error);
  return getErrorMessage(code);
}
