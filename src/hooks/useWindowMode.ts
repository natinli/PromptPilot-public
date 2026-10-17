/**
 * useWindowMode — 窗口模式管理 Hook
 * 从 Electron IPC 迁移到 Tauri invoke
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "@/lib/tauri-api";

export type WindowMode = "mini" | "full";

export function useWindowMode() {
  const [mode, setMode] = useState<WindowMode>("mini");
  const isSwitchingRef = useRef(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const navigate = useNavigate();

  /**
   * 创建全屏遮罩 div（匹配页面背景色）
   * 用遮罩覆盖内容来代替 window.hide()，避免 WebView2 渲染管线冻结/闪烁
   */
  const createOverlay = useCallback(() => {
    const overlay = document.createElement("div");
    overlay.id = "mode-switch-overlay";
    // 直接读取 body 的实际渲染背景色（一定是有效 CSS 颜色值）
    const bg = getComputedStyle(document.body).backgroundColor || "#fafafc";

    // 检测是否为半透明背景（Mica 模式）
    // Mica 模式下 body 背景是 rgba(255,255,255,0.25) 之类的半透明色，
    // 直接用作遮罩背景无法完全遮住旧内容。
    // 解决方案：使用超强 backdrop-filter blur 来模糊掉旧内容，
    // 配合半透明白色背景，视觉效果与 Mica 毛玻璃一致，不会出现突兀的纯色闪烁。
    const alphaMatch = bg.match(/rgba\(\s*\d+,\s*\d+,\s*\d+,\s*(0(?:\.\d+)?)\s*\)/);
    const isTransparent = !!alphaMatch && parseFloat(alphaMatch[1]) < 1;

    // 使用超大固定尺寸而非 inset:0 —— 当窗口 resize 放大时，
    // fixed + inset:0 需要一帧 layout 才能扩展到新 viewport，
    // 这一帧内新扩展区域会显示 WebView2 compositor surface（黑色）。
    // 用固定 9999px 确保遮罩始终大于窗口的任何可能尺寸。
    const styles: Record<string, string> = {
      position: "fixed",
      top: "-500px",
      left: "-500px",
      width: "9999px",
      height: "9999px",
      zIndex: "99999",
      background: isTransparent ? "rgba(255,255,255,0.85)" : bg,
      opacity: "0",
      transition: "opacity 60ms ease-out",
      pointerEvents: "all",
    };
    // Mica 模式：用超强 blur 模糊掉遮罩下方的旧内容
    if (isTransparent) {
      styles.backdropFilter = "blur(60px) saturate(1.5)";
      styles.webkitBackdropFilter = "blur(60px) saturate(1.5)";
    }
    Object.assign(overlay.style, styles);
    document.body.appendChild(overlay);
    return overlay;
  }, []);

  /**
   * 模式切换核心流程 — 遮罩法（Overlay Approach）
   *
   * 核心设计：窗口始终保持可见，不调用 hide/show，
   * 用全屏遮罩 div（匹配背景色）覆盖内容来隐藏过渡过程。
   *
   * 优势：
   * - 完全绕过 WebView2 hide/show 的渲染管线冻结问题
   * - 没有旧帧闪现（遮罩在最上层，resize 期间用户只看到纯色背景）
   * - 渲染管线持续运行，不存在 compositor 重启延迟
   *
   * 流程：插入遮罩 → 遮罩淡入 → resize+navigate → 等新内容就绪 → 遮罩淡出 → 移除遮罩
   */
  const doSwitch = useCallback(
    async (targetMode: WindowMode) => {
      if (isSwitchingRef.current) return;
      isSwitchingRef.current = true;
      setIsSwitching(true);

      const root = document.documentElement;
      let overlay: HTMLDivElement | null = null;

      try {
        // 0. 标记切换中（禁用 page-transition 动画 + 隐藏滚动条）
        root.classList.add("mode-switching");
        document.body.style.overflow = "hidden";
        root.style.overflow = "hidden";

        // 1. 创建并插入全屏遮罩
        overlay = createOverlay() as HTMLDivElement;

        // 2. 遮罩淡入 — 快速覆盖旧内容（60ms）
        //    先强制 layout 再设 opacity，确保 transition 生效
        overlay.getBoundingClientRect();
        overlay.style.opacity = "1";

        // 等待遮罩完全不透明
        await new Promise((r) => setTimeout(r, 70));

        // 3. Tauri: 保存 bounds + 调整窗口尺寸（窗口保持可见，遮罩挡住了内容）
        const route = await api.prepareSwitch(targetMode);

        // 4. 等待窗口 resize 完成
        //    Rust set_size/set_position 是异步的，返回时窗口可能还没调整完。
        //    等一个小延迟 + 一帧，让 OS 窗口管理器完成 resize 并通知 WebView2 重新 layout
        await new Promise<void>((resolve) => {
          setTimeout(() => requestAnimationFrame(() => resolve()), 30);
        });

        // 5. 路由跳转（遮罩挡着，用户看不到旧内容闪烁）
        navigate(route);

        // 6. 通知 Rust 端切换完成（set_focus）
        await api.finishSwitch();
        setMode(targetMode);

        // 7. 等待新内容完成 layout + paint
        //    三次 rAF + 20ms 延迟确保 React 完成挂载、样式计算、compositor paint
        //    （MiniPage/DashboardPage 挂载后有 Hook 初始化和状态更新需要额外渲染周期）
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => setTimeout(resolve, 20))
            )
          );
        });

        // 8. 强制同步一次 layout，确保渲染管线已 flush
        document.body.getBoundingClientRect();

        // 9. 恢复滚动条
        document.body.style.overflow = "";
        root.style.overflow = "";

        // 10. 遮罩淡出 — 露出新内容（150ms easeOut）
        overlay.style.transition = "opacity 150ms cubic-bezier(0.0, 0.0, 0.2, 1)";
        overlay.style.opacity = "0";

        // 11. 淡出完成后移除遮罩 + 清理
        setTimeout(() => {
          overlay?.remove();
          root.classList.remove("mode-switching");
        }, 170);
      } catch (err) {
        console.error("[useWindowMode] 切换失败:", err);
        overlay?.remove();
        root.style.overflow = "";
        document.body.style.overflow = "";
        root.classList.remove("mode-switching");
        root.style.opacity = "1";
        try {
          await api.finishSwitch();
        } catch {
          /* ignore */
        }
      } finally {
        isSwitchingRef.current = false;
        setIsSwitching(false);
      }
    },
    [navigate, createOverlay]
  );

  // 初始化：获取当前窗口模式
  useEffect(() => {
    api
      .getWindowMode()
      .then((currentMode) => {
        // Rust 端直接返回 "mini" 或 "full" 字符串
        setMode(currentMode as WindowMode);
      })
      .catch(console.error);
  }, []);

  const switchToFull = useCallback(() => doSwitch("full"), [doSwitch]);
  const switchToMini = useCallback(() => doSwitch("mini"), [doSwitch]);

  return {
    mode,
    isSwitching,
    switchToFull,
    switchToMini,
    /** Tauri 环境始终为 true */
    isTauri: true,
  };
}
