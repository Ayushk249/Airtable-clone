// components/DataGrid.tsx
"use client";

import { forwardRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Loader2, Plus, Search, AlertCircle } from "lucide-react";
import type { Column, RowWithCells } from "../interface";

interface DataGridProps {
  tableData: RowWithCells[];
  filteredTableData: RowWithCells[];
  columns: Column[];
  columnWidth: number;
  rowHeight: number;
  editingCell: {rowId: string, columnId: string} | null;
  tempCellValues: Record<string, Record<string, string>>;
  pendingChanges: Record<string, Record<string, { value: string, timestamp: number }>>;
  validationErrors: Record<string, string>;
  searchQuery: string;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isRowsLoading: boolean;
  rowsError: any;
  infiniteRowData: any;
  updateCellMutation: any;
  createRowMutation: any;
  onCellEdit: (rowId: string, columnId: string) => void;
  onCellUpdate: (rowId: string, columnId: string, value: string) => void;
  onAddRow: () => void;
  onScroll: (source: 'data', scrollLeft: number) => void;
  onFetchNextPage: () => void;
  onSearchClear: () => void;
  highlightSearchTerm: (text: string, searchTerm: string) => React.ReactNode;
  getValidationError: (value: string, columnType: any) => string | null;
  setValidationErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setEditingCell: React.Dispatch<React.SetStateAction<{rowId: string, columnId: string} | null>>;
}

export const DataGrid = forwardRef<HTMLDivElement, DataGridProps>(
  ({
    tableData,
    filteredTableData,
    columns,
    columnWidth,
    rowHeight,
    editingCell,
    tempCellValues,
    pendingChanges,
    validationErrors,
    searchQuery,
    hasNextPage,
    isFetchingNextPage,
    isRowsLoading,
    rowsError,
    infiniteRowData,
    updateCellMutation,
    createRowMutation,
    onCellEdit,
    onCellUpdate,
    onAddRow,
    onScroll,
    onFetchNextPage,
    onSearchClear,
    highlightSearchTerm,
    getValidationError,
    setValidationErrors,
    setEditingCell
  }, ref) => {
    // Setup row virtualizer with infinite scroll support
    const rowVirtualizer = useVirtualizer({
      count: hasNextPage ? filteredTableData.length + 1 : filteredTableData.length + 1,
      getScrollElement: () => ref?.current,
      estimateSize: () => rowHeight,
      overscan: 10,
    });

    // Infinite scroll detection
    useEffect(() => {
      const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();

      if (!lastItem) return;

      if (
        lastItem.index >= filteredTableData.length - 5 &&
        hasNextPage &&
        !isFetchingNextPage
      ) {
        onFetchNextPage();
      }
    }, [
      hasNextPage,
      onFetchNextPage,
      isFetchingNextPage,
      rowVirtualizer.getVirtualItems(),
      filteredTableData.length,
    ]);

    if (isRowsLoading && !infiniteRowData) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading table data...</p>
          </div>
        </div>
      );
    }

    if (rowsError) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-600 mb-2">Error loading table data</p>
            <p className="text-gray-500 text-sm">Please refresh the page to try again</p>
          </div>
        </div>
      );
    }

    return (
      <div 
        ref={ref}
        className="flex-1 overflow-auto min-h-0"
        onScroll={(e) => {
          onScroll('data', e.currentTarget.scrollLeft);
        }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: `${(columns.length * columnWidth) + 16}px`,
            position: 'relative',
          }}
        >
          {/* Show "No results" when search returns empty */}
          {searchQuery && filteredTableData.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Search className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-gray-600 font-medium">No results found</p>
                <p className="text-gray-500 text-sm">
                  Try adjusting your search to find what you're looking for.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSearchClear}
                  className="mt-2"
                >
                  Clear search
                </Button>
              </div>
            </div>
          ) : (
            /* Virtualized Rows */
            rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const isAddRowButton = virtualRow.index === filteredTableData.length;
              const isLoadingRow = virtualRow.index > filteredTableData.length;
              const row = filteredTableData[virtualRow.index];

              if (isLoadingRow && hasNextPage) {
                return (
                  <div
                    key={`loading-${virtualRow.key}`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex border-b bg-gray-50"
                  >
                    <div className="w-16 flex items-center justify-center border-r">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    </div>
                    <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                      {isFetchingNextPage ? 'Loading more rows...' : 'Scroll to load more'}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className="flex border-b hover:bg-gray-50"
                >
                  <div 
                    className="w-16 bg-gray-50 border-r flex-shrink-0 flex items-center justify-center"
                    style={{ height: `${virtualRow.size}px` }}
                  >
                    {isAddRowButton ? (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={onAddRow} 
                        className="h-8 w-8 p-0 hover:bg-gray-200 rounded-none"
                        disabled={createRowMutation.isPending}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    ) : (
                      <span className="text-sm text-gray-500">
                        {virtualRow.index + 1}
                      </span>
                    )}
                  </div>

                  {columns.map((column) => {
                    let content: React.ReactNode = null;

                    if (isAddRowButton) {
                      content = <div className="h-12" />;
                    } else if (row) {
                      const isTemporaryRow = row.id.startsWith('temp-row-');
                      let value = "";

                      if (isTemporaryRow) {
                        value = tempCellValues[row.id]?.[column.id] || "";
                      } else if (pendingChanges[row.id]?.[column.id]) {
                        value = pendingChanges[row.id][column.id].value;
                      } else {
                        const cell = row.cells.find(c => c.columnId === column.id);
                        value = cell?.value || "";
                      }

                      const isEditing = editingCell?.rowId === row.id && editingCell?.columnId === column.id;
                      const isUpdating = updateCellMutation.isPending && 
                                        updateCellMutation.variables?.rowId === row.id && 
                                        updateCellMutation.variables?.columnId === column.id;

                      // Check for validation errors
                      const cellKey = `${row.id}-${column.id}`;
                      const hasValidationError = validationErrors[cellKey];

                      if (isEditing) {
                        content = (
                          <div className="relative">
                            <Input
                              defaultValue={value}
                              autoFocus
                              type={column.type === "NUMBER" ? "text" : "text"} // Use text for better control
                              className={`border-none rounded-none focus:ring-0 focus:border-blue-500 px-4 h-12 w-full ${
                                hasValidationError ? 'border-red-500 focus:border-red-500' : ''
                              }`}
                              disabled={isUpdating}
                              // Real-time validation for NUMBER columns
                              onChange={(e) => {
                                if (column.type === "NUMBER") {
                                  const newValue = e.target.value;
                                  const error = getValidationError(newValue, column.type);
                                  if (error) {
                                    setValidationErrors(prev => ({
                                      ...prev,
                                      [cellKey]: error
                                    }));
                                  } else {
                                    setValidationErrors(prev => {
                                      const { [cellKey]: removed, ...rest } = prev;
                                      return rest;
                                    });
                                  }
                                }
                              }}
                              onBlur={(e) => {
                                const newValue = e.target.value;
                                if (newValue !== value) {
                                  onCellUpdate(row.id, column.id, newValue);
                                } else {
                                  setEditingCell(null);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const newValue = e.currentTarget.value;
                                  if (newValue !== value) {
                                    onCellUpdate(row.id, column.id, newValue);
                                  } else {
                                    setEditingCell(null);
                                  }
                                } else if (e.key === "Escape") {
                                  setEditingCell(null);
                                  // Clear validation errors on escape
                                  setValidationErrors(prev => {
                                    const { [cellKey]: removed, ...rest } = prev;
                                    return rest;
                                  });
                                }
                              }}
                            />
                          </div>
                        );
                      } else {
                        content = (
                          <div 
                            className={`cursor-pointer hover:bg-gray-100 px-4 h-12 flex items-center w-full group relative ${
                              hasValidationError ? 'bg-red-50 border-l-2 border-red-500' : ''
                            }`}
                            onClick={() => {
                              if (!isUpdating) {
                                onCellEdit(row.id, column.id);
                              }
                            }}
                            title={hasValidationError ? `Error: ${hasValidationError}` : value}
                          >
                            <span 
                              className={`text-sm w-full block ${hasValidationError ? 'text-red-600' : ''}`}
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '100%'
                              }}
                            >
                              {hasValidationError ? (
                                <div className="flex items-center">
                                  <AlertCircle className="h-3 w-3 mr-1 text-red-500" />
                                  <span className="text-red-600">{value}</span>
                                </div>
                              ) : (
                                searchQuery ? highlightSearchTerm(value, searchQuery) : (value || "")
                              )}
                            </span>

                            {/* Custom tooltip for long text */}
                            {value && value.length > 25 && !hasValidationError && (
                              <div 
                                className="absolute left-0 top-12 bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 max-w-xs break-words pointer-events-none"
                                style={{ wordWrap: 'break-word' }}
                              >
                                {value}
                              </div>
                            )}

                            {/* Validation error tooltip */}
                            {hasValidationError && (
                              <div 
                                className="absolute left-0 top-12 bg-red-600 text-white text-xs px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-50 max-w-xs break-words pointer-events-none"
                                style={{ wordWrap: 'break-word' }}
                              >
                                {hasValidationError}
                              </div>
                            )}
                          </div>
                        );
                      }
                    } else {
                      content = (
                        <div className="px-4 h-12 flex items-center w-full text-red-500 text-xs">
                          Missing row {virtualRow.index}
                        </div>
                      );
                    }

                    return (
                      <div
                        key={column.id}
                        className="border-r flex-shrink-0 relative overflow-hidden bg-white"
                        style={{
                          width: columnWidth,
                          maxWidth: columnWidth,
                          minWidth: columnWidth
                        }}
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }
);

DataGrid.displayName = "DataGrid";