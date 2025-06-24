// components/TableHeader.tsx
"use client";

import { Button } from "~/components/ui/button";
import { Loader2, Plus } from "lucide-react";

interface Table {
  id: string;
  name: string;
  baseId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TableHeaderProps {
  allTables: Table[];
  isTablesLoading: boolean;
  currentTableId: string;
  isLoadingTable: boolean;
  onTableSwitch: (tableId: string) => void;
  onCreateTableClick: () => void;
  isCreatingTable: boolean;
}

export function TableHeader({
  allTables,
  isTablesLoading,
  currentTableId,
  isLoadingTable,
  onTableSwitch,
  onCreateTableClick,
  isCreatingTable
}: TableHeaderProps) {
  return (
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
                  table.id === currentTableId
                    ? "bg-purple-700"
                    : "text-purple-100 hover:bg-purple-700"
                }`}
                onClick={() => !isLoadingTable && onTableSwitch(table.id)}
              >
                {table.name}
              </div>
            ))
          )}
          
          <Button
            variant="ghost"
            size="sm"
            className="text-purple-100 hover:bg-purple-700 px-3 py-3 rounded-none h-auto"
            onClick={onCreateTableClick}
            disabled={isCreatingTable}
          >
            {isCreatingTable ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}