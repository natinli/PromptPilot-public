
import type { ReactNode } from "react";
import { ApiKeyProvider } from "@/components/settings/api-key-provider";
import { SettingsDialog } from "@/components/settings/settings-dialog";

/**
 * ClientProviders - 全局 Provider 包装
 * 包含 API Key 管理等功能
 */
export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ApiKeyProvider>
      {children}
      {/* 全局设置弹窗，由 ApiKeyProvider 控制开关 */}
      <SettingsDialog />
    </ApiKeyProvider>
  );
}
