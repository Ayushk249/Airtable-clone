// app/table/[tableId]/TableView2.tsx
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";
import { Plus, Edit2, Trash2, ChevronUp, ChevronDown, Search } from "lucide-react";

// Import types that match your Prisma schema
import type { Column, Row, Cell, ColumnType, RowWithCells } from "./interface";

interface TableViewProps {
  tableId: string;
  initialData: RowWithCells[];
  initialColumns: Column[];
}

export function TableView({ tableId, initialData, initialColumns }: TableViewProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [newColumnName, setNewColumnName] = useState("");
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [editingCell, setEditingCell] = useState<{rowId: string, columnId: string} | null>(null);
  
  // Track temporary cell values for rows that haven't been saved yet
  const [tempCellValues, setTempCellValues] = useState<Record<string, Record<string, string>>>({});
  
  // Track pending changes to prevent server overwrites
  const [pendingChanges, setPendingChanges] = useState<Record<string, Record<string, { value: string, timestamp: number }>>>({});
  
  // Track temp row to real row mapping
  const [tempToRealMapping, setTempToRealMapping] = useState<Record<string, string>>({});
  
  // Track when we last made local changes
  const [lastLocalChange, setLastLocalChange] = useState<number>(0);

  // Auto-finalize temp rows after inactivity
  useEffect(() => {
    const autoFinalize = setInterval(() => {
      const now = Date.now();
      
      // Auto-finalize temp rows that have been inactive for 30 seconds
      if (now - lastLocalChange > 30000) {
        setTempToRealMapping(currentMapping => {
          const mappingEntries = Object.entries(currentMapping);
          if (mappingEntries.length === 0) return currentMapping;
          
          let updatedMapping = { ...currentMapping };
          let hasChanges = false;
          
          mappingEntries.forEach(([tempRowId, realRowId]) => {
            // This temp row has a real backing, can auto-finalize
            setTempCellValues(prev => {
              const { [tempRowId]: removed, ...rest } = prev;
              return rest;
            });
            delete updatedMapping[tempRowId];
            hasChanges = true;
          });
          
          return hasChanges ? updatedMapping : currentMapping;
        });
      }
      
      // Clean up old pending changes
      setPendingChanges(prev => {
        const cleaned = { ...prev };
        let hasChanges = false;
        
        Object.keys(cleaned).forEach(rowId => {
          Object.keys(cleaned[rowId]).forEach(columnId => {
            if (now - cleaned[rowId][columnId].timestamp > 30000) {
              delete cleaned[rowId][columnId];
              hasChanges = true;
            }
          });
          
          if (Object.keys(cleaned[rowId]).length === 0) {
            delete cleaned[rowId];
            hasChanges = true;
          }
        });
        
        return hasChanges ? cleaned : prev;
      });
    }, 15000); // Check every 15 seconds
    
    return () => clearInterval(autoFinalize);
  }, [lastLocalChange]);

  const utils = api.useUtils();

  // First, get the columns data
  const { data: columns = [] } = api.column.getByTableId.useQuery(
    { tableId },
    { 
      initialData: initialColumns,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  );

  // Then get the raw table data
  const { data: rawTableData = [] } = api.row.getByTableId.useQuery(
    { tableId },
    { 
      initialData,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  );

  // Smart data selector that preserves local changes and manages temp rows
  const smartDataSelect = useCallback((serverData: RowWithCells[]) => {
    if (!serverData) return [];
    
    // Start with server data, but filter out rows that have temp equivalents still active
    const filteredServerData = serverData.filter(row => {
      // Check if this real row has a temp equivalent that's still active
      const tempRowId = Object.keys(tempToRealMapping).find(tempId => tempToRealMapping[tempId] === row.id);
      if (tempRowId && tempCellValues[tempRowId]) {
        // If temp row still has values, keep the temp row instead of this real row
        return false;
      }
      return true;
    });
    
    // Add temp rows to the data
    const tempRows: RowWithCells[] = Object.keys(tempCellValues).map(tempRowId => {
      // If this temp row is mapped to a real row, use the real row structure
      const realRowId = tempToRealMapping[tempRowId];
      if (realRowId) {
        const realRow = serverData.find(r => r.id === realRowId);
        if (realRow) {
          // Use real row structure but with temp values
          return {
            ...realRow,
            id: tempRowId, // Keep temp ID for UI consistency
            cells: realRow.cells.map(cell => ({
              ...cell,
              id: `temp-cell-${tempRowId}-${cell.columnId}`,
              rowId: tempRowId,
              value: tempCellValues[tempRowId]?.[cell.columnId] || "",
            }))
          };
        }
      }
      
      // Fallback: create temp row structure
      return {
        id: tempRowId,
        tableId,
        position: 999, // Put temp rows at the end
        createdAt: new Date(),
        updatedAt: new Date(),
        cells: columns.map(col => ({
          id: `temp-cell-${tempRowId}-${col.id}`,
          rowId: tempRowId,
          columnId: col.id,
          value: tempCellValues[tempRowId]?.[col.id] || "",
          createdAt: new Date(),
          updatedAt: new Date(),
          column: col,
        }))
      };
    });
    
    // Merge server data with pending changes
    const mergedServerData = filteredServerData.map(row => {
      const rowPendingChanges = pendingChanges[row.id];
      if (!rowPendingChanges) {
        return row;
      }
      
      return {
        ...row,
        cells: row.cells.map(cell => {
          const pendingChange = rowPendingChanges[cell.columnId];
          if (pendingChange) {
            return {
              ...cell,
              value: pendingChange.value
            };
          }
          return cell;
        })
      };
    });
    
    // Combine and sort
    return [...mergedServerData, ...tempRows].sort((a, b) => a.position - b.position);
  }, [pendingChanges, tempCellValues, tempToRealMapping, tableId, columns]);

  // Apply smart selection to protect local changes
  const tableData = useMemo(() => smartDataSelect(rawTableData), [rawTableData, smartDataSelect]);

  // Enhanced column creation
  const createColumnMutation = api.column.create.useMutation({
    onMutate: async (variables) => {
      await utils.column.getByTableId.cancel({ tableId });
      const previousColumns = utils.column.getByTableId.getData({ tableId });

      const optimisticColumn: Column = {
        id: `temp-${Date.now()}`,
        name: variables.name,
        type: variables.type ?? "TEXT",
        tableId: variables.tableId,
        position: (previousColumns?.length ?? 0),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      utils.column.getByTableId.setData({ tableId }, (old) => {
        return [...(old ?? []), optimisticColumn];
      });

      setNewColumnName("");
      setIsAddingColumn(false);

      return { previousColumns };
    },
    onSuccess: (realColumn) => {
      utils.column.getByTableId.setData({ tableId }, (oldColumns) => {
        if (!oldColumns) return [realColumn];
        return oldColumns.map(col => 
          col.id.startsWith('temp-') ? realColumn : col
        );
      });
    },
    onError: (error, variables, context) => {
      if (context?.previousColumns) {
        utils.column.getByTableId.setData({ tableId }, context.previousColumns);
      }
      setNewColumnName("");
      setIsAddingColumn(false);
      console.error('Failed to create column:', error);
    },
  });

  // Batch update multiple cells - no optimistic updates needed (values already visible)
  const batchUpdateCells = api.cell.update.useMutation({
    // No onMutate - we don't want optimistic updates here since values are already shown
    onSuccess: () => {
      // Don't invalidate here to prevent refresh - values are already correct
    },
    onError: (error) => {
      console.error("Batch cell update failed:", error);
      // Only refresh on error to show true server state
      void utils.row.getByTableId.invalidate({ tableId });
    }
  });

  // Enhanced cell update with temp row synchronization - NO AUTO-FINALIZATION
  const updateCellMutation = api.cell.update.useMutation({
    onMutate: async ({ rowId, columnId, value }) => {
      // Don't do optimistic updates for rows linked to temp rows
      const linkedTempRow = Object.keys(tempToRealMapping).find(tempId => tempToRealMapping[tempId] === rowId);
      if (linkedTempRow) {
        // Just update the temp row values - don't touch server cache
        setTempCellValues(prev => ({
          ...prev,
          [linkedTempRow]: {
            ...prev[linkedTempRow],
            [columnId]: value
          }
        }));
        return { linkedTempRow, savedValue: value, savedColumnId: columnId };
      }

      // For standalone real rows, do normal optimistic update
      await utils.row.getByTableId.cancel({ tableId });
      const previousRows = utils.row.getByTableId.getData({ tableId });

      utils.row.getByTableId.setData({ tableId }, (oldRows) => {
        if (!oldRows) return oldRows;
        
        return oldRows.map(row => {
          if (row.id !== rowId) return row;
          
          return {
            ...row,
            cells: row.cells.map(cell => {
              if (cell.columnId !== columnId) return cell;
              return { 
                ...cell, 
                value, 
                updatedAt: new Date() 
              };
            })
          };
        });
      });

      return { previousRows, rowId, columnId };
    },
    onSuccess: (result, variables, context) => {
      // For temp rows linked to real rows - NEVER auto-finalize
      if (context?.linkedTempRow) {
        // Just mark as successfully saved, but keep temp row visible
        return;
      }

      // For standalone real rows, clear pending changes
      setPendingChanges(prev => {
        const newPending = { ...prev };
        if (newPending[variables.rowId]) {
          delete newPending[variables.rowId][variables.columnId];
          if (Object.keys(newPending[variables.rowId]).length === 0) {
            delete newPending[variables.rowId];
          }
        }
        return newPending;
      });
    },
    onError: (err, variables, context) => {
      // For temp rows, revert the local change on error
      if (context?.linkedTempRow && context?.savedColumnId) {
        setTempCellValues(prev => {
          const updated = { ...prev };
          if (updated[context.linkedTempRow] && updated[context.linkedTempRow][context.savedColumnId]) {
            // Remove the failed value, reverting to previous state
            delete updated[context.linkedTempRow][context.savedColumnId];
            // If no values left, remove the temp row entry
            if (Object.keys(updated[context.linkedTempRow]).length === 0) {
              delete updated[context.linkedTempRow];
            }
          }
          return updated;
        });
        return;
      }

      // Revert optimistic update on error (only for standalone rows)
      if (context?.previousRows) {
        utils.row.getByTableId.setData({ tableId }, context.previousRows);
      }
      
      // Clear pending changes on error
      if (context?.rowId && context?.columnId) {
        setPendingChanges(prev => {
          const newPending = { ...prev };
          if (newPending[context.rowId]) {
            delete newPending[context.rowId][context.columnId];
            if (Object.keys(newPending[context.rowId]).length === 0) {
              delete newPending[context.rowId];
            }
          }
          return newPending;
        });
      }
      
      console.error('Failed to update cell:', err);
    },
  });

  // Enhanced cell update handling - COMPLETELY SILENT AND SEAMLESS
  const handleCellUpdate = useCallback((rowId: string, columnId: string, value: string) => {
    const timestamp = Date.now();
    setLastLocalChange(timestamp);
    
    if (rowId.startsWith('temp-row-')) {
      // Always update temp cell values for temp rows
      setTempCellValues(prev => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          [columnId]: value
        }
      }));
      
      setEditingCell(null);
      
      // If this temp row is mapped to a real row, also save to server silently
      const realRowId = tempToRealMapping[rowId];
      if (realRowId && value.trim()) {
        // Save to server but keep temp row visible
        updateCellMutation.mutate({
          rowId: realRowId,
          columnId,
          value
        });
      }
    } else {
      // For real rows, track as pending change and save
      setPendingChanges(prev => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          [columnId]: { value, timestamp }
        }
      }));
      
      setEditingCell(null);
      
      // Update server
      updateCellMutation.mutate({
        rowId,
        columnId,
        value
      });
    }
  }, [updateCellMutation, tempToRealMapping]);

  // Enhanced row deletion - SIMPLE AND CLEAN
  const deleteRowMutation = api.row.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.row.getByTableId.cancel({ tableId });
      const previousRows = utils.row.getByTableId.getData({ tableId });

      // If deleting a temp row, clean up all related state
      if (id.startsWith('temp-row-')) {
        setTempCellValues(prev => {
          const { [id]: removed, ...rest } = prev;
          return rest;
        });
        setTempToRealMapping(prev => {
          const { [id]: removed, ...rest } = prev;
          return rest;
        });
        return { previousRows, wasTempRow: true };
      }

      // For real rows, check if there's a temp row mapping to this real row
      const tempRowId = Object.keys(tempToRealMapping).find(tempId => tempToRealMapping[tempId] === id);
      if (tempRowId) {
        // Also clean up the temp row state
        setTempCellValues(prev => {
          const { [tempRowId]: removed, ...rest } = prev;
          return rest;
        });
        setTempToRealMapping(prev => {
          const { [tempRowId]: removed, ...rest } = prev;
          return rest;
        });
      }

      utils.row.getByTableId.setData({ tableId }, (oldRows) => {
        if (!oldRows) return oldRows;
        return oldRows.filter(row => row.id !== id);
      });

      return { previousRows, wasTempRow: false };
    },
    onSuccess: (result, variables, context) => {
      // Silent success
    },
    onError: (error, variables, context) => {
      if (context?.previousRows && !context?.wasTempRow) {
        utils.row.getByTableId.setData({ tableId }, context.previousRows);
      }
      console.error('Failed to delete row:', error);
    },
  });

  // Enhanced row creation - ROWS PERSIST FOREVER UNTIL USER DELETES
  const createRowMutation = api.row.create.useMutation({
    onMutate: async (variables) => {
      // Cancel any ongoing queries to prevent conflicts
      await utils.row.getByTableId.cancel({ tableId });
      const previousRows = utils.row.getByTableId.getData({ tableId });

      const tempRowId = `temp-row-${Date.now()}`;
      
      // Initialize temp row with empty values - this row will PERSIST
      setTempCellValues(prev => ({
        ...prev,
        [tempRowId]: {}
      }));

      return { previousRows, tempRowId };
    },
    onSuccess: async (realRow, variables, context) => {
      if (!realRow || !context?.tempRowId) {
        console.error("Missing real row or temp row ID");
        return;
      }

      // Establish mapping between temp and real row
      setTempToRealMapping(prev => ({
        ...prev,
        [context.tempRowId]: realRow.id
      }));

      // Save any temp values that exist for this temp row
      const saveTempValues = async () => {
        const currentTempValues = tempCellValues[context.tempRowId];
        if (currentTempValues && Object.keys(currentTempValues).length > 0) {
          // Save each value individually in background
          for (const [columnId, value] of Object.entries(currentTempValues)) {
            if (value.trim()) {
              try {
                await batchUpdateCells.mutateAsync({
                  rowId: realRow.id,
                  columnId,
                  value
                });
              } catch (error) {
                console.error(`Failed to save cell ${columnId}:`, error);
              }
            }
          }
        }
      };
      
      // Execute the save operation
      saveTempValues();
      
      // NEVER auto-remove the temp row - it stays visible until user explicitly deletes it
      // This ensures both empty rows and rows with data persist as expected
    },
    onError: (error, variables, context) => {
      if (context?.tempRowId) {
        console.error(`Failed to create real row for temp row ${context.tempRowId}:`, error);
        // Keep temp row on error - user data is still there
      }
    },
  });

  // Create column definitions
  const columnHelper = createColumnHelper<RowWithCells>();
  
  const tableColumns = useMemo<ColumnDef<RowWithCells>[]>(() => {
    const dynamicColumns = columns
      .sort((a, b) => a.position - b.position)
      .map((col) =>
        columnHelper.accessor(
          (row) => {
            const isTemporaryRow = row.id.startsWith('temp-row-');
            
            // For temporary rows, always use temp values
            if (isTemporaryRow) {
              return tempCellValues[row.id]?.[col.id] || "";
            }
            
            // For real rows, check pending changes first
            if (pendingChanges[row.id]?.[col.id]) {
              return pendingChanges[row.id][col.id].value;
            }
            
            // Fall back to actual cell value
            const cell = row.cells.find(c => c.columnId === col.id);
            return cell?.value || "";
          },
          {
            id: col.id,
            header: ({ column }) => (
              <div className="flex items-center gap-2">
                <span>{col.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                  {column.getIsSorted() === "asc" ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : column.getIsSorted() === "desc" ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <div className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ),
            cell: ({ row, getValue }) => {
              const isEditing = editingCell?.rowId === row.original.id && editingCell?.columnId === col.id;
              const value = getValue() as string;
              const isUpdating = updateCellMutation.isPending && 
                                updateCellMutation.variables?.rowId === row.original.id && 
                                updateCellMutation.variables?.columnId === col.id;
              
              if (isEditing) {
                return (
                  <Input
                    defaultValue={value}
                    autoFocus
                    className="h-8"
                    disabled={isUpdating}
                    onBlur={(e) => {
                      const newValue = e.target.value;
                      if (newValue !== value) {
                        handleCellUpdate(row.original.id, col.id, newValue);
                      } else {
                        setEditingCell(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const newValue = e.currentTarget.value;
                        if (newValue !== value) {
                          handleCellUpdate(row.original.id, col.id, newValue);
                        } else {
                          setEditingCell(null);
                        }
                      } else if (e.key === "Escape") {
                        setEditingCell(null);
                      }
                    }}
                  />
                );
              }
              
              return (
                <div 
                  className={`cursor-pointer hover:bg-gray-100 p-1 rounded min-h-[32px] flex items-center ${
                    isUpdating ? "opacity-75" : ""
                  }`}
                  onClick={() => {
                    if (!isUpdating) {
                      setEditingCell({ rowId: row.original.id, columnId: col.id });
                    }
                  }}
                >
                  {value || <span className="text-gray-400">Click to edit</span>}
                </div>
              );
            },
          }
        )
      );

    const actionsColumn = columnHelper.display({
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (window.confirm("Are you sure you want to delete this row?")) {
              deleteRowMutation.mutate({ id: row.original.id });
            }
          }}
          disabled={deleteRowMutation.isPending}
        >
          {deleteRowMutation.isPending && deleteRowMutation.variables?.id === row.original.id ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      ),
    });

    return [...dynamicColumns, actionsColumn];
  }, [columns, editingCell, updateCellMutation, deleteRowMutation, columnHelper, tempCellValues, pendingChanges, tempToRealMapping, handleCellUpdate]);

  const table = useReactTable({
    data: tableData,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
  });

  const handleAddColumn = () => {
    if (newColumnName.trim()) {
      createColumnMutation.mutate({
        name: newColumnName.trim(),
        type: "TEXT",
        tableId,
      });
    }
  };

  const handleAddRow = () => {
    setEditingCell(null);
    createRowMutation.mutate({
      tableId,
    });
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search all columns..."
            value={globalFilter ?? ""}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="max-w-sm"
          />
        </div>
        
        <div className="flex items-center gap-2">
          {isAddingColumn ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Column name"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddColumn();
                  if (e.key === "Escape") {
                    setIsAddingColumn(false);
                    setNewColumnName("");
                  }
                }}
                autoFocus
              />
              <Button 
                onClick={handleAddColumn} 
                disabled={!newColumnName.trim() || createColumnMutation.isPending}
              >
                {createColumnMutation.isPending ? "Adding..." : "Add"}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsAddingColumn(false);
                  setNewColumnName("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button onClick={() => setIsAddingColumn(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Column
            </Button>
          )}
          
          <Button 
            onClick={handleAddRow}
            disabled={createRowMutation.isPending}
          >
            {createRowMutation.isPending ? (
              <>
                <Plus className="h-4 w-4 mr-2 animate-pulse" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Add Row
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-md">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id} className="border-b bg-gray-50">
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-4 py-3 text-left font-medium text-gray-900"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td 
                    colSpan={tableColumns.length} 
                    className="text-center py-8 text-gray-500"
                  >
                    No rows yet. Click "Add Row" to create your first row.
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr 
                    key={row.id} 
                    className="border-b hover:bg-gray-50"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          {table.getFilteredRowModel().rows.length === 0 ? (
            "No rows to display"
          ) : (
            <>
              Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{" "}
              {Math.min(
                (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length
              )}{" "}
              of {table.getFilteredRowModel().rows.length} rows
            </>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}