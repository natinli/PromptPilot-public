import { useEffect, useState } from "react";
import { usePrompts } from "./prompts/hooks/usePrompts";
import { usePromptActions } from "./prompts/hooks/usePromptActions";
import { CreatePromptDialog } from "@/components/prompt/create-prompt-dialog";
import PromptSearchBar from "./prompts/components/PromptSearchBar";
import PromptGrid from "./prompts/components/PromptGrid";
import PromptPagination from "./prompts/components/PromptPagination";
import PromptDetailModal from "./prompts/components/PromptDetailModal";

export default function PromptsPage() {
  const {
    prompts,
    setPrompts,
    pagination,
    categories,
    setCategories,
    loading,
    initialized,
    filters,
    updateFilter,
    goToPage,
    adjustTotal,
    stats,
    getCategoryName,
    fetchPrompts,
    isDragMode,
    handleDragEnd,
  } = usePrompts();

  const actions = usePromptActions(setPrompts, adjustTotal);
  const [createPromptOpen, setCreatePromptOpen] = useState(false);

  // 同步详情面板中的数据
  useEffect(() => {
    if (actions.detailPrompt) {
      const updated = prompts.find((p) => p.id === actions.detailPrompt!.id);
      if (updated && updated !== actions.detailPrompt) {
        actions.setDetailPrompt(updated);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts, actions.detailPrompt, actions.setDetailPrompt]);

  // 首次数据加载完成前不渲染任何内容，避免刷新时闪过骨架屏/空状态
  if (!initialized) {
    return null;
  }

  return (
    <div className="flex flex-col pt-6 pb-6 h-full">
      {/* 搜索 + 筛选栏 */}
      <PromptSearchBar
        filters={filters}
        categories={categories}
        onUpdateFilter={updateFilter}
        stats={stats}
        onAddPrompt={() => setCreatePromptOpen(true)}
        onCategoriesChange={setCategories}
      />

      {/* 卡片网格主体 */}
      <div className="flex-1 min-h-0 overflow-y-auto pt-2">
        <PromptGrid
          prompts={prompts}
          loading={loading}
          getCategoryName={getCategoryName}
          copiedId={actions.copiedId}
          isDragMode={isDragMode}
          onOpen={actions.openDetail}
          onToggleFavorite={actions.toggleFavorite}
          onCopy={actions.copyFromCard}
          onDragEnd={handleDragEnd}
        />

        {/* 分页 */}
        {!loading && prompts.length > 0 && (
          <PromptPagination
            pagination={pagination}
            onGoToPage={goToPage}
          />
        )}
      </div>

      {/* 模态详情面板 */}
      {actions.detailPrompt && (
        <PromptDetailModal
          prompt={actions.detailPrompt}
          categories={categories}
          getCategoryName={getCategoryName}
          onUpdateCategory={actions.updateCategory}
          onCategoriesChange={setCategories}
          copiedDetail={actions.copiedDetail}
          onCopyDetail={actions.copyFromDetail}
          onToggleFavorite={actions.toggleFavorite}
          isEditing={actions.isEditing}
          editTitle={actions.editTitle}
          editContent={actions.editContent}
          saving={actions.saving}
          onSetEditTitle={actions.setEditTitle}
          onSetEditContent={actions.setEditContent}
          onStartEdit={actions.startEdit}
          onCancelEdit={actions.cancelEdit}
          onSaveEdit={actions.saveEdit}
          deleteConfirmId={actions.deleteConfirmId}
          onConfirmDelete={actions.confirmDelete}
          onCancelDelete={actions.cancelDelete}
          onExecuteDelete={actions.executeDelete}
          onClose={actions.closeDetail}
          onGoToOptimize={actions.goToOptimize}
        />
      )}

      <CreatePromptDialog
        open={createPromptOpen}
        onOpenChange={setCreatePromptOpen}
        categories={categories}
        onSave={async (data) => {
          await actions.createManualPrompt(data);
          // prompts-page 事件会被当前页面主动忽略，因此这里显式按当前筛选和分页刷新。
          await fetchPrompts();
        }}
      />
    </div>
  );
}
