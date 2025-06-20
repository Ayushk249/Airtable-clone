// app/table/[tableId]/table-view.tsx
"use client";

import { useState, useMemo, useCallback } from "react";
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
// Simple toast replacement - you can install sonner later for better UX
const toast = {
  success: (message: string, options?: any) => console.log('✅', message),
  error: (message: string) => console.error('❌', message),
  loading: (message: string, options?: any) => console.log('⏳', message),
};

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

  // tRPC queries
  const { data: tableData = [] } = api.row.getByTableId.useQuery(
    { tableId },
    { initialData }
  );
  
  const { data: columns = [] } = api.column.getByTableId.useQuery(
    { tableId },
    { initialData: initialColumns }
  );

  const utils = api.useUtils();

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
      void utils.row.getByTableId.invalidate({ tableId });
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

  // Enhanced cell update - ONLY for real rows (not temp rows)
  const updateCellMutation = api.cell.update.useMutation({
    onMutate: async ({ rowId, columnId, value }) => {
      // This should never be called with temp rows now
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

      setEditingCell(null);
      toast.success("Cell updated!");
      return { previousRows };
    },
    onError: (err, variables, context) => {
      if (context?.previousRows) {
        utils.row.getByTableId.setData({ tableId }, context.previousRows);
      }
      toast.error("Failed to update cell");
      console.error('Failed to update cell:', err);
    },
  });

  // Separate function to handle cell updates (temp or real)
  const handleCellUpdate = useCallback((rowId: string, columnId: string, value: string) => {
    if (rowId.startsWith('temp-row-')) {
      // Handle temp row updates locally only
      setTempCellValues(prev => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          [columnId]: value
        }
      }));
      setEditingCell(null);
      toast.success("Change saved locally - will sync when row is created", {
        duration: 2000,
      });
    } else {
      // Handle real row updates with server call
      updateCellMutation.mutate({
        rowId,
        columnId,
        value
      });
    }
  }, [updateCellMutation]);

  // Batch update multiple cells at once
  const batchUpdateCells = api.cell.update.useMutation({
    onSuccess: () => {
      toast.success("Row saved successfully!");
    },
    onError: () => {
      toast.error("Failed to save some changes");
    }
  });

  // Enhanced row deletion
  const deleteRowMutation = api.row.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.row.getByTableId.cancel({ tableId });
      const previousRows = utils.row.getByTableId.getData({ tableId });

      utils.row.getByTableId.setData({ tableId }, (oldRows) => {
        if (!oldRows) return oldRows;
        return oldRows.filter(row => row.id !== id);
      });

      // Clean up temp cell values if it was a temp row
      if (id.startsWith('temp-row-')) {
        setTempCellValues(prev => {
          const { [id]: removed, ...rest } = prev;
          return rest;
        });
      }

      toast.success("Row deleted!");
      return { previousRows };
    },
    onError: (error, variables, context) => {
      if (context?.previousRows) {
        utils.row.getByTableId.setData({ tableId }, context.previousRows);
      }
      toast.error("Failed to delete row");
      console.error('Failed to delete row:', error);
    },
  });

  // Enhanced row creation with batch cell updates
  const createRowMutation = api.row.create.useMutation({
    onMutate: async (variables) => {
      await utils.row.getByTableId.cancel({ tableId });
      const previousRows = utils.row.getByTableId.getData({ tableId });

      const tempRowId = `temp-row-${Date.now()}`;
      const optimisticRow: RowWithCells = {
        id: tempRowId,
        tableId: variables.tableId,
        position: (previousRows?.length ?? 0),
        createdAt: new Date(),
        updatedAt: new Date(),
        cells: columns.map(col => ({
          id: `temp-cell-${tempRowId}-${col.id}`,
          rowId: tempRowId,
          columnId: col.id,
          value: "",
          createdAt: new Date(),
          updatedAt: new Date(),
          column: col,
        }))
      };

      utils.row.getByTableId.setData({ tableId }, (old) => {
        return [...(old ?? []), optimisticRow];
      });

      toast.success("Row created! You can start editing immediately.");
      return { previousRows, tempRowId };
    },
    onSuccess: async (realRow, variables, context) => {
      if (!realRow || !context?.tempRowId) {
        void utils.row.getByTableId.invalidate({ tableId });
        return;
      }

      // Get any temp cell values that were entered
      const tempValues = tempCellValues[context.tempRowId];
      
      // Replace the temporary row with the real one immediately
      utils.row.getByTableId.setData({ tableId }, (oldRows) => {
        if (!oldRows) return [realRow];
        
        return oldRows.map(row => {
          if (row.id === context.tempRowId) {
            // Merge temp values into the real row
            const updatedRow = {
              ...realRow,
              cells: realRow.cells?.map(cell => ({
                ...cell,
                value: tempValues?.[cell.columnId] || cell.value || ""
              })) || []
            };
            return updatedRow;
          }
          return row;
        });
      });

      // Clean up temp cell values
      setTempCellValues(prev => {
        const { [context.tempRowId]: removed, ...rest } = prev;
        return rest;
      });

      // If there were any temp values, batch update them
      if (tempValues && Object.keys(tempValues).length > 0) {
        toast.loading("Saving your changes...", { id: "batch-update" });
        
        try {
          // Save all the temp cell values to the real row
          for (const [columnId, value] of Object.entries(tempValues)) {
            if (value.trim()) { // Only save non-empty values
              await batchUpdateCells.mutateAsync({
                rowId: realRow.id,
                columnId,
                value
              });
            }
          }
          toast.success("All changes saved!", { id: "batch-update" });
        } catch (error) {
          toast.error("Some changes couldn't be saved", { id: "batch-update" });
          console.error("Batch update failed:", error);
        }
      }
    },
    onError: (error, variables, context) => {
      if (context?.previousRows) {
        utils.row.getByTableId.setData({ tableId }, context.previousRows);
      }
      if (context?.tempRowId) {
        setTempCellValues(prev => {
          const { [context.tempRowId]: removed, ...rest } = prev;
          return rest;
        });
      }
      toast.error("Failed to create row");
      console.error('Failed to create row:', error);
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
            
            // For temporary rows, check our local state first
            if (isTemporaryRow && tempCellValues[row.id]?.[col.id] !== undefined) {
              return tempCellValues[row.id][col.id];
            }
            
            // For real rows or no temp value, use the cell value
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
              
              const isTemporaryRow = row.original.id.startsWith('temp-row-');
              
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
                  } ${isTemporaryRow ? "border-l-2 border-blue-400" : ""}`}
                  onClick={() => {
                    if (!isUpdating) {
                      setEditingCell({ rowId: row.original.id, columnId: col.id });
                    }
                  }}
                  title={isTemporaryRow ? "New row - changes will be saved automatically" : undefined}
                >
                  {value || <span className="text-gray-400">Empty</span>}
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
  }, [columns, editingCell, updateCellMutation, deleteRowMutation, columnHelper, tempCellValues, handleCellUpdate]);

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
                table.getRowModel().rows.map((row) => {
                  const isTemporaryRow = row.original.id.startsWith('temp-row-');
                  return (
                    <tr 
                      key={row.id} 
                      className={`border-b hover:bg-gray-50 ${
                        isTemporaryRow ? "bg-blue-50/20" : ""
                      }`}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  );
                })
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