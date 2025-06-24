// components/Toolbar.tsx
"use client";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "~/components/ui/dropdown-menu";
import { List, Grid3X3, EyeOff, ArrowUpDown, ChevronDown, Loader2, Search, X } from "lucide-react";

interface ToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isLoading: boolean;
  createColumnIsPending: boolean;
  filteredDataLength: number;
  totalDataLength: number;
}

export function Toolbar({ 
  searchQuery, 
  onSearchChange, 
  isLoading,
  createColumnIsPending,
  filteredDataLength,
  totalDataLength
}: ToolbarProps) {
  return (
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
                {createColumnIsPending ? "Creating..." : "Adding row..."}
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
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 pr-8 w-64 h-8"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {searchQuery && (
            <div className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded">
              {filteredDataLength} of {totalDataLength} rows
            </div>
          )}
        </div>
      </div>
    </div>
  );
}