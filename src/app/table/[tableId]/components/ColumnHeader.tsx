// components/ColumnHeader.tsx
"use client";

import { forwardRef } from "react";
import { Button } from "~/components/ui/button";
import { Plus, ChevronDown } from "lucide-react";
import type { Column } from "../interface";

interface ColumnHeaderProps {
  columns: Column[];
  columnWidth: number;
  onAddColumn: () => void;
  onScroll: (source: 'header', scrollLeft: number) => void;
}

export const ColumnHeader = forwardRef<HTMLDivElement, ColumnHeaderProps>(
  ({ columns, columnWidth, onAddColumn, onScroll }, ref) => {
    return (
      <div className="border-b bg-gray-50 flex flex-shrink-0">
        <div className="w-16 px-4 py-3 text-center font-medium text-gray-900 border-r bg-gray-50 flex-shrink-0">
          #
        </div>
        
        <div 
          ref={ref}
          className="flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          onScroll={(e) => {
            onScroll('header', e.currentTarget.scrollLeft);
          }}
        >
          <div className="flex" style={{ width: `${columns.length * columnWidth}px` }}>
            {columns.map((column) => (
              <div 
                key={column.id}
                className="border-r bg-gray-50 flex-shrink-0 overflow-hidden"
                style={{ 
                  width: columnWidth,
                  maxWidth: columnWidth,
                  minWidth: columnWidth
                }}
              >
                <div className="flex items-center justify-between px-4 py-3 overflow-hidden">
                  <div className="flex items-center flex-1 mr-2">
                    <span 
                      className="font-medium truncate"
                      title={column.name}
                    >
                      {column.name}
                    </span>
                    {/* Show column type indicator */}
                    <span className={`ml-2 text-xs px-1 py-0.5 rounded ${
                      column.type === 'NUMBER' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {column.type === 'NUMBER' ? '123' : 'Aa'}
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="w-16 flex items-center justify-center border-r bg-gray-50 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddColumn}
            className="h-6 w-6 p-0 hover:bg-gray-200"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }
);

ColumnHeader.displayName = "ColumnHeader";