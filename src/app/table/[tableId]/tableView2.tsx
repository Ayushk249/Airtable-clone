// app/table/[tableId]/tableView.tsx
"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "~/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { api } from "~/trpc/react";
import { Plus, ChevronDown, Grid3X3, EyeOff, ArrowUpDown, List, Loader2, Search, X } from "lucide-react";

// Import types that match your Prisma schema
import type { Column, Row, Cell, ColumnType, RowWithCells } from "./interface";

interface TableViewProps {
  tableId: string;
  initialData: RowWithCells[];
  initialColumns: Column[];
  tableName: string;
  baseName: string;
  baseId: string;
}

export function TableView({ tableId, initialData, initialColumns, tableName, baseName, baseId }: TableViewProps) {
  const router = useRouter();
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnType, setNewColumnType] = useState<"TEXT" | "NUMBER">("TEXT");
  const [showCreateFieldModal, setShowCreateFieldModal] = useState(false);
  const [editingCell, setEditingCell] = useState<{rowId: string, columnId: string} | null>(null);
  
  // Table tab management states
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [isLoadingTable, setIsLoadingTable] = useState(false);
  
  // Search functionality
  const [searchQuery, setSearchQuery] = useState("");
  
  // Track temporary cell values for rows that haven't been saved yet
  const [tempCellValues, setTempCellValues] = useState<Record<string, Record<string, string>>>({});
  
  // Track pending changes to prevent server overwrites
  const [pendingChanges, setPendingChanges] = useState<Record<string, Record<string, { value: string, timestamp: number }>>>({});
  
  // Track temp row to real row mapping
  const [tempToRealMapping, setTempToRealMapping] = useState<Record<string, string>>({});
  
  // Track when we last made local changes
  const [lastLocalChange, setLastLocalChange] = useState<number>(0);

  // Refs for virtualization and scroll sync
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  // Fixed column width in pixels
  const COLUMN_WIDTH = 200;
  const ROW_HEIGHT = 48;

  const utils = api.useUtils();

  // Fetch all tables in this base for the tab navigation
  const { data: allTables = [], isLoading: isTablesLoading } = api.table.getAllByBase.useQuery(
    { baseId },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
    }
  );

  // Synchronize horizontal scrolling between header and data
  const syncScroll = useCallback((source: 'header' | 'data', scrollLeft: number) => {
    if (source === 'data' && headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollLeft;
    } else if (source === 'header' && tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = scrollLeft;
    }
  }, []);

  // Create table mutation
  const createTableMutation = api.table.create.useMutation({
    onMutate: async (variables) => {
      await utils.table.getAllByBase.cancel({ baseId });
      const previousTables = utils.table.getAllByBase.getData({ baseId });
      
      const optimisticTable = {
        id: `temp-table-${Date.now()}`,
        name: variables.name,
        baseId: variables.baseId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      utils.table.getAllByBase.setData({ baseId }, (old) => {
        return [...(old ?? []), optimisticTable];
      });
      
      setNewTableName("");
      setShowCreateTableModal(false);
      
      return { previousTables, tempTableId: optimisticTable.id };
    },
    onSuccess: (realTable, variables, context) => {
      utils.table.getAllByBase.setData({ baseId }, (oldTables) => {
        if (!oldTables) return [realTable];
        return oldTables.map(table => 
          table.id === context?.tempTableId ? realTable : table
        );
      });
      router.push(`/table/${realTable.id}`);
    },
    onError: (error, variables, context) => {
      if (context?.previousTables) {
        utils.table.getAllByBase.setData({ baseId }, context.previousTables);
      }
      setNewTableName("");
      setShowCreateTableModal(false);
      console.error('Failed to create table:', error);
    },
  });

  // Handle table switching with loading state
  const handleTableSwitch = async (newTableId: string) => {
    if (newTableId === tableId) return;
    setIsLoadingTable(true);
    await new Promise(resolve => setTimeout(resolve, 300));
    router.push(`/table/${newTableId}`);
  };

  const handleCreateTable = () => {
    if (newTableName.trim()) {
      createTableMutation.mutate({
        name: newTableName.trim(),
        baseId,
      });
    }
  };

  // Function to highlight search terms in text
  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm.trim() || !text) return text;
    
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 text-black">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Auto-finalize temp rows after inactivity
  useEffect(() => {
    const autoFinalize = setInterval(() => {
      const now = Date.now();
      
      if (now - lastLocalChange > 30000) {
        setTempToRealMapping(currentMapping => {
          const mappingEntries = Object.entries(currentMapping);
          if (mappingEntries.length === 0) return currentMapping;
          
          let updatedMapping = { ...currentMapping };
          let hasChanges = false;
          
          mappingEntries.forEach(([tempRowId, realRowId]) => {
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
    }, 15000);
    
    return () => clearInterval(autoFinalize);
  }, [lastLocalChange]);

  // Get the columns data
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

  // Get table data with infinite scrolling
  const {
    data: infiniteRowData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isRowsLoading,
    isError: rowsError,
  } = api.row.getByTableIdInfinite.useInfiniteQuery(
    { 
      tableId,
      limit: 50,
    },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      ...(initialData.length > 0 && {
        initialData: {
          pages: [{ items: initialData, nextCursor: undefined }],
          pageParams: [undefined],
        }
      }),
    }
  );

  // Flatten infinite data into single array
  const allRows = useMemo(() => {
    if (!infiniteRowData?.pages) return [];
    return infiniteRowData.pages.flatMap(page => page.items);
  }, [infiniteRowData]);

  // Smart data selector that preserves local changes and manages temp rows
  const smartDataSelect = useCallback((serverData: RowWithCells[]) => {
    if (!serverData) return [];
    
    const filteredServerData = serverData.filter(row => {
      const tempRowId = Object.keys(tempToRealMapping).find(tempId => tempToRealMapping[tempId] === row.id);
      if (tempRowId && tempCellValues[tempRowId]) {
        return false;
      }
      return true;
    });
    
    const tempRows: RowWithCells[] = Object.keys(tempCellValues).map(tempRowId => {
      const realRowId = tempToRealMapping[tempRowId];
      if (realRowId) {
        const realRow = serverData.find(r => r.id === realRowId);
        if (realRow) {
          return {
            ...realRow,
            id: tempRowId,
            cells: realRow.cells.map(cell => ({
              ...cell,
              id: `temp-cell-${tempRowId}-${cell.columnId}`,
              rowId: tempRowId,
              value: tempCellValues[tempRowId]?.[cell.columnId] || "",
            }))
          };
        }
      }
      
      return {
        id: tempRowId,
        tableId,
        position: 999,
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
    
    return [...mergedServerData, ...tempRows].sort((a, b) => a.position - b.position);
  }, [pendingChanges, tempCellValues, tempToRealMapping, tableId, columns]);

  // Apply smart selection to protect local changes
  const tableData = useMemo(() => smartDataSelect(allRows), [allRows, smartDataSelect]);

  // Filter data based on search query
  const filteredTableData = useMemo(() => {
    if (!searchQuery.trim()) {
      return tableData;
    }

    const query = searchQuery.toLowerCase().trim();
    
    return tableData.filter(row => {
      // Search across all cells in the row
      return row.cells.some(cell => {
        const cellValue = cell.value?.toLowerCase() || "";
        return cellValue.includes(query);
      });
    });
  }, [tableData, searchQuery]);

  // Setup row virtualizer with infinite scroll support
  const rowVirtualizer = useVirtualizer({
    count: hasNextPage ? filteredTableData.length + 1 : filteredTableData.length + 1,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
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
      void fetchNextPage();
    }
  }, [
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    rowVirtualizer.getVirtualItems(),
    filteredTableData.length,
  ]);

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
      setNewColumnType("TEXT");
      setShowCreateFieldModal(false);

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
      setNewColumnType("TEXT");
      setShowCreateFieldModal(false);
      console.error('Failed to create column:', error);
    },
  });

  // Batch update multiple cells
  const batchUpdateCells = api.cell.update.useMutation({
    onSuccess: () => {
      // Don't invalidate here to prevent refresh
    },
    onError: (error) => {
      console.error("Batch cell update failed:", error);
      void utils.row.getByTableId.invalidate({ tableId });
    }
  });

  // Enhanced cell update with temp row synchronization
  const updateCellMutation = api.cell.update.useMutation({
    onMutate: async ({ rowId, columnId, value }) => {
      const linkedTempRow = Object.keys(tempToRealMapping).find(tempId => tempToRealMapping[tempId] === rowId);
      if (linkedTempRow) {
        setTempCellValues(prev => ({
          ...prev,
          [linkedTempRow]: {
            ...prev[linkedTempRow],
            [columnId]: value
          }
        }));
        return { linkedTempRow, savedValue: value, savedColumnId: columnId };
      }

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
      if (context?.linkedTempRow) {
        return;
      }

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
      if (context?.linkedTempRow && context?.savedColumnId) {
        setTempCellValues(prev => {
          const updated = { ...prev };
          if (updated[context.linkedTempRow] && updated[context.linkedTempRow][context.savedColumnId]) {
            delete updated[context.linkedTempRow][context.savedColumnId];
            if (Object.keys(updated[context.linkedTempRow]).length === 0) {
              delete updated[context.linkedTempRow];
            }
          }
          return updated;
        });
        return;
      }

      if (context?.previousRows) {
        utils.row.getByTableId.setData({ tableId }, context.previousRows);
      }
      
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

  // Enhanced cell update handling
  const handleCellUpdate = useCallback((rowId: string, columnId: string, value: string) => {
    const timestamp = Date.now();
    setLastLocalChange(timestamp);
    
    if (rowId.startsWith('temp-row-')) {
      setTempCellValues(prev => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          [columnId]: value
        }
      }));
      
      setEditingCell(null);
      
      const realRowId = tempToRealMapping[rowId];
      if (realRowId && value.trim()) {
        updateCellMutation.mutate({
          rowId: realRowId,
          columnId,
          value
        });
      }
    } else {
      setPendingChanges(prev => ({
        ...prev,
        [rowId]: {
          ...prev[rowId],
          [columnId]: { value, timestamp }
        }
      }));
      
      setEditingCell(null);
      
      updateCellMutation.mutate({
        rowId,
        columnId,
        value
      });
    }
  }, [updateCellMutation, tempToRealMapping]);

  // Enhanced row deletion
  const deleteRowMutation = api.row.delete.useMutation({
    onMutate: async ({ id }) => {
      await utils.row.getByTableId.cancel({ tableId });
      const previousRows = utils.row.getByTableId.getData({ tableId });

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

      const tempRowId = Object.keys(tempToRealMapping).find(tempId => tempToRealMapping[tempId] === id);
      if (tempRowId) {
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

  // Enhanced row creation
  const createRowMutation = api.row.create.useMutation({
    onMutate: async (variables) => {
      await utils.row.getByTableId.cancel({ tableId });
      const previousRows = utils.row.getByTableId.getData({ tableId });

      const tempRowId = `temp-row-${Date.now()}`;
      
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

      setTempToRealMapping(prev => ({
        ...prev,
        [context.tempRowId]: realRow.id
      }));

      const saveTempValues = async () => {
        const currentTempValues = tempCellValues[context.tempRowId];
        if (currentTempValues && Object.keys(currentTempValues).length > 0) {
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
      
      saveTempValues();
    },
    onError: (error, variables, context) => {
      if (context?.tempRowId) {
        console.error(`Failed to create real row for temp row ${context.tempRowId}:`, error);
      }
    },
  });

  const handleCreateField = () => {
    if (newColumnName.trim()) {
      createColumnMutation.mutate({
        name: newColumnName.trim(),
        type: newColumnType,
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

  // Check if any mutations are pending for loading state
  const isLoading = createColumnMutation.isPending || createRowMutation.isPending;

  // Show loading screen when switching tables
  if (isLoadingTable) {
    return (
      <div className="h-full bg-white flex flex-col overflow-hidden">
        <div className="bg-purple-600 text-white flex-shrink-0">
          <div className="flex items-center px-0">
            <div className="flex items-center">
              {isTablesLoading ? (
                <div className="bg-purple-700 px-4 py-3 text-sm font-medium border-r border-purple-500 flex items-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading tables...
                </div>
              ) : (
                allTables.map((table) => (
                  <div
                    key={table.id}
                    className={`px-4 py-3 text-sm font-medium cursor-pointer border-r border-purple-500 transition-colors ${
                      table.id === tableId
                        ? "bg-purple-700"
                        : "text-purple-100 hover:bg-purple-700"
                    }`}
                    onClick={() => !isLoadingTable && handleTableSwitch(table.id)}
                  >
                    {table.name}
                  </div>
                ))
              )}
              
              <Button
                variant="ghost"
                size="sm"
                className="text-purple-100 hover:bg-purple-700 px-3 py-3 rounded-none h-auto"
                onClick={() => setShowCreateTableModal(true)}
                disabled={createTableMutation.isPending}
              >
                {createTableMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-white flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-purple-600" />
            <p className="text-gray-600 text-lg font-medium">Loading table...</p>
          
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white flex flex-col overflow-hidden">
      {/* Header with Tabs - Fixed */}
      <div className="bg-purple-600 text-white flex-shrink-0">
        <div className="flex items-center px-0">
          <div className="flex items-center">
            {isTablesLoading ? (
              <div className="bg-purple-700 px-4 py-3 text-sm font-medium border-r border-purple-500 flex items-center">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading tables...
              </div>
            ) : (
              allTables.map((table) => (
                <div
                  key={table.id}
                  className={`px-4 py-3 text-sm font-medium cursor-pointer border-r border-purple-500 transition-colors ${
                    table.id === tableId
                      ? "bg-purple-700"
                      : "text-purple-100 hover:bg-purple-700"
                  }`}
                  onClick={() => handleTableSwitch(table.id)}
                >
                  {table.name}
                </div>
              ))
            )}
            
            <Button
              variant="ghost"
              size="sm"
              className="text-purple-100 hover:bg-purple-700 px-3 py-3 rounded-none h-auto"
              onClick={() => setShowCreateTableModal(true)}
              disabled={createTableMutation.isPending}
            >
              {createTableMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar - Fixed */}
      <div className="border-b bg-gray-50 px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-gray-700">
                  <List className="h-4 w-4 mr-2" />
                  Views
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Grid view</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-gray-700">
                  <Grid3X3 className="h-4 w-4 mr-2" />
                  Grid view
                  <ChevronDown className="h-4 w-4 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Grid view</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="sm" className="text-gray-700">
              <EyeOff className="h-4 w-4 mr-2" />
              Hide fields
            </Button>

            <Button variant="ghost" size="sm" className="text-gray-700">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              Sort
            </Button>

            {isLoading && (
              <div className="flex items-center space-x-2 text-gray-600 px-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm font-medium">
                  {createColumnMutation.isPending ? "Creating..." : "Adding row..."}
                </span>
              </div>
            )}
          </div>

          {/* Search component on the right */}
          <div className="flex items-center space-x-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search all columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-8 w-64 h-8"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {searchQuery && (
              <div className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
                {filteredTableData.length} of {tableData.length} rows
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Column Headers */}
      <div className="border-b bg-gray-50 flex flex-shrink-0">
        <div className="w-16 px-4 py-3 text-center font-medium text-gray-900 border-r bg-gray-50 flex-shrink-0">
          #
        </div>
        
        <div 
          ref={headerScrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          onScroll={(e) => {
            syncScroll('header', e.currentTarget.scrollLeft);
          }}
        >
          <div className="flex" style={{ width: `${columns.length * COLUMN_WIDTH}px` }}>
            {columns.map((column) => (
              <div 
                key={column.id}
                className="border-r bg-gray-50 flex-shrink-0"
                style={{ width: COLUMN_WIDTH }}
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="font-medium">{column.name}</span>
                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="w-16 flex items-center justify-center border-r bg-gray-50 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreateFieldModal(true)}
            className="h-6 w-6 p-0 hover:bg-gray-200"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable Table Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {isRowsLoading && !infiniteRowData ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Loading table data...</p>
            </div>
          </div>
        ) : rowsError ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-red-600 mb-2">Error loading table data</p>
              <p className="text-gray-500 text-sm">Please refresh the page to try again</p>
            </div>
          </div>
        ) : (
          <div 
            ref={tableContainerRef}
            className="flex-1 overflow-auto min-h-0"
            onScroll={(e) => {
              syncScroll('data', e.currentTarget.scrollLeft);
            }}
          >
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: `${(columns.length * COLUMN_WIDTH) + 16}px`,
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
                      onClick={() => setSearchQuery("")}
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
                            onClick={handleAddRow} 
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

                      {columns.map((column, columnIndex) => {
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

                          if (isEditing) {
                            content = (
                              <Input
                                defaultValue={value}
                                autoFocus
                                className="border-none rounded-none focus:ring-0 focus:border-blue-500 px-4 h-12 w-full"
                                disabled={isUpdating}
                                onBlur={(e) => {
                                  const newValue = e.target.value;
                                  if (newValue !== value) {
                                    handleCellUpdate(row.id, column.id, newValue);
                                  } else {
                                    setEditingCell(null);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const newValue = e.currentTarget.value;
                                    if (newValue !== value) {
                                      handleCellUpdate(row.id, column.id, newValue);
                                    } else {
                                      setEditingCell(null);
                                    }
                                  } else if (e.key === "Escape") {
                                    setEditingCell(null);
                                  }
                                }}
                              />
                            );
                          } else {
                            content = (
                              <div 
                                className="cursor-pointer hover:bg-gray-100 px-4 h-12 flex items-center w-full"
                                onClick={() => {
                                  if (!isUpdating) {
                                    setEditingCell({ rowId: row.id, columnId: column.id });
                                  }
                                }}
                              >
                                {searchQuery ? highlightSearchTerm(value, searchQuery) : (value || "")}
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
                            style={{
                              width: `${COLUMN_WIDTH}px`,
                            }}
                            className="border-r flex-shrink-0"
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
        )}
      </div>

      {/* Create Field Modal */}
      <Dialog open={showCreateFieldModal} onOpenChange={setShowCreateFieldModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="field-name">Field name (optional)</Label>
              <Input
                id="field-name"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Field name"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="field-type">Type</Label>
              <Select value={newColumnType} onValueChange={(value: "TEXT" | "NUMBER") => setNewColumnType(value)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEXT">Text</SelectItem>
                  <SelectItem value="NUMBER">Number</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateFieldModal(false);
                setNewColumnName("");
                setNewColumnType("TEXT");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateField}
              disabled={createColumnMutation.isPending}
            >
              {createColumnMutation.isPending ? "Creating..." : "Create field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Table Modal */}
      <Dialog open={showCreateTableModal} onOpenChange={setShowCreateTableModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Create table</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="table-name">Table name</Label>
              <Input
                id="table-name"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Enter table name"
                className="mt-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateTable();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setShowCreateTableModal(false);
                setNewTableName("");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTable}
              disabled={createTableMutation.isPending || !newTableName.trim()}
            >
              {createTableMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Creating...
                </>
              ) : (
                "Create table"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}