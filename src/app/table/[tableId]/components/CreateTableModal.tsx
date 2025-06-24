// components/CreateTableModal.tsx
"use client";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "~/components/ui/dialog";
import { Loader2 } from "lucide-react";

interface CreateTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: () => void;
  isLoading?: boolean;
  newTableName: string;
  setNewTableName: (name: string) => void;
}

export function CreateTableModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  isLoading = false,
  newTableName,
  setNewTableName
}: CreateTableModalProps) {
  const handleClose = () => {
    setNewTableName("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
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
                  onSubmit();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={onSubmit}
            disabled={isLoading || !newTableName.trim()}
          >
            {isLoading ? (
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
  );
}