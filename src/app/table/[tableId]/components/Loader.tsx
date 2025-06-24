// components/LoadingStates.tsx
"use client";

import { Loader2 } from "lucide-react";

interface LoadingStateProps {
  message?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function LoadingState({ 
  message = "Loading...", 
  size = "md",
  className = ""
}: LoadingStateProps) {
  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-6 w-6", 
    lg: "h-8 w-8"
  };

  const textSizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg"
  };

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className="text-center">
        <Loader2 className={`${sizeClasses[size]} animate-spin mx-auto mb-2 text-purple-600`} />
        <p className={`text-gray-600 ${textSizeClasses[size]} font-medium`}>
          {message}
        </p>
      </div>
    </div>
  );
}

export function TableLoadingState() {
  return (
    <div className="h-full bg-white flex flex-col overflow-hidden">
      <div className="bg-purple-600 text-white flex-shrink-0">
        <div className="flex items-center px-0">
          <div className="flex items-center">
            <div className="bg-purple-700 px-4 py-3 text-sm font-medium border-r border-purple-500 flex items-center">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading tables...
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white flex items-center justify-center">
        <LoadingState message="Loading table..." size="lg" />
      </div>
    </div>
  );
}

export function InlineLoadingSpinner({ message }: { message?: string }) {
  return (
    <div className="flex items-center space-x-2 text-gray-600 px-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm font-medium">
        {message || "Loading..."}
      </span>
    </div>
  );
}