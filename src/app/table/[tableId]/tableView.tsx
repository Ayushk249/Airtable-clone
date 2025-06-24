// app/table/[tableId]/tableView.tsx
"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { Loader2 } from "lucide-react";

// Import types
import type { Column, RowWithCells, ColumnType } from "./interface";

// Import components
import { TableHeader } from "./components/TableHeader";
import { Toolbar } from "./components/Toolbar";
import { ColumnHeader } from "./components/ColumnHeader";
import { DataGrid } from "./components/DataGrid";
import { CreateTableModal } from "./components/CreateTableModal";
import { CreateFieldModal } from "./components/CreateFieldModal";

interface TableViewProps {
  tableId: string;
  initialData: RowWithCells[];
  initialColumns: Column[];
  tableName: string;
  baseName: string;
  baseId: string;
}

export function TableView({ 
  tableId, 
  initialData, 
  initialColumns, 
  tableName, 
  baseName, 
  baseId 
}: TableViewProps) {
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
  
  // Validation error states
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
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

      // Pre-populate the cache with the new table's data
      if (realTable && 'rows' in realTable && 'columns' in realTable) {
        utils.row.getByTableId.setData({ tableId: realTable.id }, realTable.rows || []);
        utils.column.getByTableId.setData({ tableId: realTable.id }, realTable.columns || []);
        
        utils.row.getByTableIdInfinite.setData(
          { tableId: realTable.id },
          {
            pages: [{
              items: realTable.rows || [],
              nextCursor: undefined
            }],
            pageParams: [undefined]
          }
        );
      }

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

  // Number validation function
  const validateNumber = (value: string): boolean => {
    if (value.trim() === "") return true; // Allow empty values
    
    // Allow negative numbers, decimals, and scientific notation
    const numberRegex = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
    return numberRegex.test(value.trim());
  };

  // Get validation error message
  const getValidationError = (value: string, columnType: ColumnType): string | null => {
    if (columnType === "NUMBER" && value.trim() !== "" && !validateNumber(value)) {
      return "Please enter a valid number";
    }
    return null;
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
      return row.cells.some(cell => {
        const cellValue = cell.value?.toLowerCase() || "";
        return cellValue.includes(query);
      });
    });
  }, [tableData, searchQuery]);

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

  // Enhanced cell update with validation
  const updateCellMutation = api.cell.update.useMutation({
    onMutate: async ({ rowId, columnId, value }) => {
      // Clear any existing validation errors for this cell
      const cellKey = `${rowId}-${columnId}`;
      setValidationErrors(prev => {
        const { [cellKey]: removed, ...rest } = prev;
        return rest;
      });

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
      // Show validation error if it's a validation error
      if (err.message.includes("Invalid number")) {
        const cellKey = `${variables.rowId}-${variables.columnId}`;
        setValidationErrors(prev => ({
          ...prev,
          [cellKey]: "Please enter a valid number"
        }));
      }

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

  // Enhanced cell update handling with validation
  const handleCellUpdate = useCallback((rowId: string, columnId: string, value: string) => {
    const timestamp = Date.now();
    setLastLocalChange(timestamp);

    // Find the column to check its type
    const column = columns.find(col => col.id === columnId);
    if (!column) return;

    // Validate the value
    const validationError = getValidationError(value, column.type);
    const cellKey = `${rowId}-${columnId}`;
    
    if (validationError) {
      setValidationErrors(prev => ({
        ...prev,
        [cellKey]: validationError
      }));
      setEditingCell(null);
      return; // Don't save invalid values
    }

    // Clear any existing validation errors
    setValidationErrors(prev => {
      const { [cellKey]: removed, ...rest } = prev;
      return rest;
    });
    
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
  }, [updateCellMutation, tempToRealMapping, columns]);

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
        <TableHeader
          allTables={allTables}
          isTablesLoading={isTablesLoading}
          currentTableId={tableId}
          isLoadingTable={isLoadingTable}
          onTableSwitch={handleTableSwitch}
          onCreateTableClick={() => setShowCreateTableModal(true)}
          isCreatingTable={createTableMutation.isPending}
        />
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
      <TableHeader
        allTables={allTables}
        isTablesLoading={isTablesLoading}
        currentTableId={tableId}
        isLoadingTable={isLoadingTable}
        onTableSwitch={handleTableSwitch}
        onCreateTableClick={() => setShowCreateTableModal(true)}
        isCreatingTable={createTableMutation.isPending}
      />

      {/* Toolbar - Fixed */}
      <Toolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isLoading={isLoading}
        createColumnIsPending={createColumnMutation.isPending}
        filteredDataLength={filteredTableData.length}
        totalDataLength={tableData.length}
      />

      {/* Fixed Column Headers */}
      <ColumnHeader
        ref={headerScrollRef}
        columns={columns}
        columnWidth={COLUMN_WIDTH}
        onAddColumn={() => setShowCreateFieldModal(true)}
        onScroll={syncScroll}
      />

      {/* Scrollable Table Body */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <DataGrid
          ref={tableContainerRef}
          tableData={tableData}
          filteredTableData={filteredTableData}
          columns={columns}
          columnWidth={COLUMN_WIDTH}
          rowHeight={ROW_HEIGHT}
          editingCell={editingCell}
          tempCellValues={tempCellValues}
          pendingChanges={pendingChanges}
          validationErrors={validationErrors}
          searchQuery={searchQuery}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          isRowsLoading={isRowsLoading}
          rowsError={rowsError}
          infiniteRowData={infiniteRowData}
          updateCellMutation={updateCellMutation}
          createRowMutation={createRowMutation}
          onCellEdit={(rowId, columnId) => setEditingCell({ rowId, columnId })}
          onCellUpdate={handleCellUpdate}
          onAddRow={handleAddRow}
          onScroll={syncScroll}
          onFetchNextPage={() => void fetchNextPage()}
          onSearchClear={() => setSearchQuery("")}
          highlightSearchTerm={highlightSearchTerm}
          getValidationError={getValidationError}
          setValidationErrors={setValidationErrors}
          setEditingCell={setEditingCell}
        />
      </div>

      {/* Create Field Modal */}
      <CreateFieldModal
        isOpen={showCreateFieldModal}
        onClose={() => setShowCreateFieldModal(false)}
        onSubmit={handleCreateField}
        isLoading={createColumnMutation.isPending}
        newColumnName={newColumnName}
        setNewColumnName={setNewColumnName}
        newColumnType={newColumnType}
        setNewColumnType={setNewColumnType}
      />

      {/* Create Table Modal */}
      <CreateTableModal
        isOpen={showCreateTableModal}
        onClose={() => setShowCreateTableModal(false)}
        onSubmit={handleCreateTable}
        isLoading={createTableMutation.isPending}
        newTableName={newTableName}
        setNewTableName={setNewTableName}
      />
    </div>
  );
}