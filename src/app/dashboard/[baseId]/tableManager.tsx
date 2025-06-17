"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";
import { Trash2 } from "lucide-react";
import Link from "next/link";

interface Table {
  id: string;
  name: string;
  baseId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface TableManagerProps {
  baseId: string;
  initialTables: Table[];
}

export function TableManager({ baseId, initialTables }: TableManagerProps) {
  const [newTableName, setNewTableName] = useState("");
  
  const { data: tables = [] } = api.table.getAllByBase.useQuery(
    { baseId },
    {
      initialData: initialTables,
    }
  );
  
  // tRPC utils for cache invalidation
  const utils = api.useUtils();
  
  const createTableMutation = api.table.create.useMutation({
    onSuccess: () => {
      // Invalidate and refetch the tables query
      void utils.table.getAllByBase.invalidate({ baseId });
      setNewTableName("");
    },
    onError: (error) => {
      console.error("Failed to create table:", error);
    }
  });


  // Delete table mutation
  const deleteTableMutation = api.table.delete.useMutation({
    onSuccess: () => {
      void utils.table.getAllByBase.invalidate({ baseId });
    },
    onError: (error) => {
      console.error("Failed to delete table:", error);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTableName.trim()) {
      createTableMutation.mutate({ 
        name: newTableName.trim(), 
        baseId 
      });
    }
  };

  const handleDelete = (tableId: string, tableName: string) => {
    if (window.confirm(`Are you sure you want to delete "${tableName}"? This action cannot be undone.`)) {
      deleteTableMutation.mutate({ id: tableId });
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="flex gap-2 mb-6">
        <Input
          value={newTableName}
          onChange={(e) => setNewTableName(e.target.value)}
          placeholder="Enter table name"
          disabled={createTableMutation.isPending}
        />
        <Button 
          type="submit" 
          disabled={createTableMutation.isPending || !newTableName.trim()}
        >
          {createTableMutation.isPending ? "Creating..." : "Create Table"}
        </Button>
      </form>

      {tables.length === 0 ? (
        <div>No tables yet in this base.</div>
      ) : (
        <ul className="space-y-2">
          {tables.map((table) => (
            <li
              key={table.id}
              className="border p-3 rounded-md hover:bg-gray-100 transition flex items-center justify-between"
            >
              <Link 
                href={`/table/${table.id}`} 
                className="font-semibold text-black hover:text-gray-800 transition-colors"
              >
                {table.name}
              </Link>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDelete(table.id, table.name)}
                disabled={deleteTableMutation.isPending}
                className="ml-4"
              >
                {deleteTableMutation.isPending ? (
                  "Deleting..."
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}