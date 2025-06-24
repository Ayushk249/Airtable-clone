// components/CreateFieldModal.tsx
"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "~/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

interface CreateFieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fieldName: string, fieldType: "TEXT" | "NUMBER") => void;
  isLoading?: boolean;
  newColumnName: string;
  setNewColumnName: (name: string) => void;
  newColumnType: "TEXT" | "NUMBER";
  setNewColumnType: (type: "TEXT" | "NUMBER") => void;
}

export function CreateFieldModal({ 
  isOpen, 
  onClose, 
  onSubmit, 
  isLoading = false,
  newColumnName,
  setNewColumnName,
  newColumnType,
  setNewColumnType
}: CreateFieldModalProps) {
  const handleSubmit = () => {
    onSubmit(newColumnName.trim(), newColumnType);
  };

  const handleClose = () => {
    setNewColumnName("");
    setNewColumnType("TEXT");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
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
                <SelectItem value="TEXT">
                  <div className="flex items-center">
                    <span className="mr-2">📝</span>
                    Text
                  </div>
                </SelectItem>
                <SelectItem value="NUMBER">
                  <div className="flex items-center">
                    <span className="mr-2">🔢</span>
                    Number
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {newColumnType === "NUMBER" 
                ? "Only numeric values will be accepted (integers and decimals)"
                : "Accepts any text input"
              }
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? "Creating..." : "Create field"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}