import { useState } from "react";

export function computeToggleOne(prev: Set<string>, id: string): Set<string> {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
}

export function computeToggleAll(prev: Set<string>, pageIds: string[]): Set<string> {
    const allSelected = pageIds.length > 0 && pageIds.every(id => prev.has(id));
    const next = new Set(prev);
    if (allSelected) { for (const id of pageIds) next.delete(id); }
    else { for (const id of pageIds) next.add(id); }
    return next;
}

export function computeIsPageAllSelected(selectedIds: Set<string>, pageIds: string[]): boolean {
    return pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
}

export function computeIsPageIndeterminate(selectedIds: Set<string>, pageIds: string[]): boolean {
    if (pageIds.length === 0) return false;
    const some = pageIds.some(id => selectedIds.has(id));
    const all = pageIds.every(id => selectedIds.has(id));
    return some && !all;
}

export interface UseSelectionResult {
    selectedIds: Set<string>;
    toggleOne: (id: string) => void;
    toggleAll: (pageIds: string[]) => void;
    clearAll: () => void;
    isPageAllSelected: (pageIds: string[]) => boolean;
    isPageIndeterminate: (pageIds: string[]) => boolean;
}

export function useSelection(resetKey?: string): UseSelectionResult {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [prevResetKey, setPrevResetKey] = useState(resetKey);

    if (prevResetKey !== resetKey) {
        setPrevResetKey(resetKey);
        setSelectedIds(new Set());
    }

    const toggleOne = (id: string) =>
        setSelectedIds(prev => computeToggleOne(prev, id));

    const toggleAll = (pageIds: string[]) =>
        setSelectedIds(prev => computeToggleAll(prev, pageIds));

    const clearAll = () => setSelectedIds(new Set());

    const isPageAllSelected = (pageIds: string[]) =>
        computeIsPageAllSelected(selectedIds, pageIds);

    const isPageIndeterminate = (pageIds: string[]) =>
        computeIsPageIndeterminate(selectedIds, pageIds);

    return { selectedIds, toggleOne, toggleAll, clearAll, isPageAllSelected, isPageIndeterminate };
}
