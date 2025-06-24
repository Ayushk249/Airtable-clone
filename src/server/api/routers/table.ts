// src/server/api/routers/table.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { faker } from "@faker-js/faker";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";

export const tableRouter = createTRPCRouter({
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      baseId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Use optimized transaction with increased timeout
      return await ctx.db.$transaction(async (tx) => {
        const newTable = await tx.table.create({
          data: {
            name: input.name,
            baseId: input.baseId,
          },
        });

  
        const columnsData = [
          { name: "Name", type: "TEXT" as const, position: 0, tableId: newTable.id },
          { name: "Age", type: "NUMBER" as const, position: 1, tableId: newTable.id },
          { name: "Email", type: "TEXT" as const, position: 2, tableId: newTable.id },
        ];
        
        await tx.column.createMany({ data: columnsData });
        
        // created columns for cell creation
        const createdColumns = await tx.column.findMany({
          where: { tableId: newTable.id },
          orderBy: { position: "asc" }
        });


        const rowsData = [
          { tableId: newTable.id, position: 0 },
          { tableId: newTable.id, position: 1 },
          { tableId: newTable.id, position: 2 },
        ];
        
        await tx.row.createMany({ data: rowsData });
        
        // Get created rows for cell creation
        const createdRows = await tx.row.findMany({
          where: { tableId: newTable.id },
          orderBy: { position: "asc" }
        });

      
        const cellsData = [];
        for (let rowIndex = 0; rowIndex < createdRows.length; rowIndex++) {
          for (let colIndex = 0; colIndex < createdColumns.length; colIndex++) {
            const row = createdRows[rowIndex];
            const column = createdColumns[colIndex];
            
            let cellValue = "";
            // Generate fake data based on column name
            switch (column.name) {
              case "Name":
                cellValue = faker.person.fullName();
                break;
              case "Age":
                cellValue = faker.number.int({ min: 18, max: 80 }).toString();
                break;
              case "Email":
                cellValue = faker.internet.email();
                break;
              default:
                // Fallback for any additional columns
                if (column.type === "NUMBER") {
                  cellValue = faker.number.int({ min: 1, max: 1000 }).toString();
                } else {
                  cellValue = faker.lorem.words({ min: 1, max: 3 });
                }
            }
            
            cellsData.push({
              rowId: row.id,
              columnId: column.id,
              value: cellValue,
            });
          }
        }
    
        await tx.cell.createMany({ data: cellsData });

        //Return the complete table with all its data for frontend cache
        return await tx.table.findUnique({
          where: { id: newTable.id },
          include: {
            columns: {
              orderBy: { position: "asc" }
            },
            rows: {
              include: {
                cells: {
                  include: {
                    column: true,
                  }
                }
              },
              orderBy: { position: "asc" }
            },
          },
        });
      }, {
        timeout: 15000,
      });
    }),


  getAllByBase: protectedProcedure
    .input(z.object({
      baseId: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.table.findMany({
        where: {
          baseId: input.baseId,
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.table.delete({
        where: {
          id: input.id,
        },
      });
    }),

  getById: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.table.findUnique({
        where: {
          id: input.id,
        },
        include: {
          columns: {
            orderBy: { position: "asc" }
          },
          rows: {
            include: {
              cells: {
                include: {
                  column: true,
                }
              }
            },
            orderBy: { position: "asc" }
          },
        },
      });
    }),
});

// Column Procedures
export const columnRouter = createTRPCRouter({
  getByTableId: protectedProcedure
    .input(z.object({ tableId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify the user owns the table
      const table = await ctx.db.table.findFirst({
        where: { id: input.tableId },
        include: { base: true },
      });

      if (!table || table.base.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return ctx.db.column.findMany({
        where: { tableId: input.tableId },
        orderBy: { position: "asc" },
      });
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      type: z.enum(["TEXT", "NUMBER"]).optional(),
      tableId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify the user owns the table
      const table = await ctx.db.table.findFirst({
        where: { id: input.tableId },
        include: { base: true },
      });

      if (!table || table.base.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Get the next position
      const lastColumn = await ctx.db.column.findFirst({
        where: { tableId: input.tableId },
        orderBy: { position: "desc" },
      });

      const newColumn = await ctx.db.column.create({
        data: {
          name: input.name,
          type: (input.type ?? "TEXT"),
          tableId: input.tableId,
          position: (lastColumn?.position ?? -1) + 1,
        },
      });

      // Create cells for this new column in all existing rows
      const existingRows = await ctx.db.row.findMany({
        where: { tableId: input.tableId },
      });

      if (existingRows.length > 0) {
        await ctx.db.cell.createMany({
          data: existingRows.map(row => ({
            rowId: row.id,
            columnId: newColumn.id,
            value: "",
          })),
        });
      }

      return newColumn;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {

      const column = await ctx.db.column.findFirst({
        where: { id: input.id },
        include: { table: { include: { base: true } } },
      });

      if (!column || column.table.base.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Delete the column (cells will be deleted due to cascade)
      return ctx.db.column.delete({
        where: { id: input.id },
      });
    }),
});

// Row Procedures
export const rowRouter = createTRPCRouter({
  getByTableIdInfinite: protectedProcedure
    .input(z.object({ 
      tableId: z.string(),
      limit: z.number().min(1).max(100).default(50),
      cursor: z.string().optional(), // cursor is row id for pagination
    }))
    .query(async ({ ctx, input }) => {
      // Verify the user owns the table
      const table = await ctx.db.table.findFirst({
        where: { id: input.tableId },
        include: { base: true },
      });

      if (!table || table.base.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const rows = await ctx.db.row.findMany({
        where: { 
          tableId: input.tableId,
          ...(input.cursor ? { id: { gt: input.cursor } } : {})
        },
        include: {
          cells: {
            include: {
              column: true,
            },
          },
        },
        orderBy: { position: "asc" },
        take: input.limit + 1, // Take one extra to determine if there's a next page
      });

      let nextCursor: typeof input.cursor | undefined = undefined;
      if (rows.length > input.limit) {
        const nextItem = rows.pop(); // Remove the extra item
        nextCursor = nextItem!.id;
      }

      return {
        items: rows,
        nextCursor,
      };
    }),

  getByTableId: protectedProcedure
    .input(z.object({ tableId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const table = await ctx.db.table.findFirst({
        where: { id: input.tableId },
        include: { base: true },
      });

      if (!table || table.base.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return ctx.db.row.findMany({
        where: { tableId: input.tableId },
        include: {
          cells: {
            include: {
              column: true,
            },
          },
        },
        orderBy: { position: "asc" },
      });
    }),

  create: protectedProcedure
    .input(z.object({
      tableId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const table = await ctx.db.table.findFirst({
        where: { id: input.tableId },
        include: { base: true },
      });

      if (!table || table.base.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Get the next position
      const lastRow = await ctx.db.row.findFirst({
        where: { tableId: input.tableId },
        orderBy: { position: "desc" },
      });

      // Create the row
      const newRow = await ctx.db.row.create({
        data: {
          tableId: input.tableId,
          position: (lastRow?.position ?? -1) + 1,
        },
      });

      // Get all columns for this table
      const columns = await ctx.db.column.findMany({
        where: { tableId: input.tableId },
      });

      // Create cells for each column
      if (columns.length > 0) {
        await ctx.db.cell.createMany({
          data: columns.map(column => ({
            rowId: newRow.id,
            columnId: column.id,
            value: "",
          })),
        });
      }

      // Return the row with cells
      return ctx.db.row.findFirst({
        where: { id: newRow.id },
        include: {
          cells: {
            include: {
              column: true,
            },
          },
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const row = await ctx.db.row.findFirst({
        where: { id: input.id },
        include: { table: { include: { base: true } } },
      });

      if (!row || row.table.base.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Delete the row (cells will be deleted due to cascade)
      return ctx.db.row.delete({
        where: { id: input.id },
      });
    }),
});


export const cellRouter = createTRPCRouter({
  update: protectedProcedure
    .input(z.object({
      rowId: z.string(),
      columnId: z.string(),
      value: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership through the row
      const row = await ctx.db.row.findFirst({
        where: { id: input.rowId },
        include: { 
          table: { include: { base: true } },
          cells: {
            where: { columnId: input.columnId },
            include: { column: true }
          }
        },
      });

      if (!row || row.table.base.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Get the column to check its type
      const column = await ctx.db.column.findUnique({
        where: { id: input.columnId },
      });

      if (!column) {
        throw new TRPCError({ 
          code: "NOT_FOUND", 
          message: "Column not found" 
        });
      }

      // NEW: Validate data based on column type
      const validatedValue = validateCellValue(input.value, column.type);

      // Update or create the cell with validated value
      return ctx.db.cell.upsert({
        where: {
          rowId_columnId: {
            rowId: input.rowId,
            columnId: input.columnId,
          },
        },
        update: {
          value: validatedValue,
        },
        create: {
          rowId: input.rowId,
          columnId: input.columnId,
          value: validatedValue,
        },
      });
    }),

  // Update multiple cells with validation
  batchUpdate: protectedProcedure
    .input(z.object({
      updates: z.array(z.object({
        rowId: z.string(),
        columnId: z.string(),
        value: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership for all rows in a single query
      const rowIds = [...new Set(input.updates.map(u => u.rowId))];
      const rows = await ctx.db.row.findMany({
        where: { 
          id: { in: rowIds },
        },
        include: { 
          table: { include: { base: true } }
        },
      });

      // Check ownership for all rows
      for (const row of rows) {
        if (row.table.base.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      // Get all columns involved for validation
      const columnIds = [...new Set(input.updates.map(u => u.columnId))];
      const columns = await ctx.db.column.findMany({
        where: { id: { in: columnIds } },
      });

      const columnMap = new Map(columns.map(col => [col.id, col]));

      // Validate and prepare updates
      const validatedUpdates = input.updates.map(update => {
        const column = columnMap.get(update.columnId);
        if (!column) {
          throw new TRPCError({ 
            code: "NOT_FOUND", 
            message: `Column ${update.columnId} not found` 
          });
        }

        return {
          ...update,
          value: validateCellValue(update.value, column.type),
        };
      });

      // Perform batch update using transaction
      return ctx.db.$transaction(async (tx) => {
        const results = [];
        
        for (const update of validatedUpdates) {
          const result = await tx.cell.upsert({
            where: {
              rowId_columnId: {
                rowId: update.rowId,
                columnId: update.columnId,
              },
            },
            update: {
              value: update.value,
            },
            create: {
              rowId: update.rowId,
              columnId: update.columnId,
              value: update.value,
            },
          });
          results.push(result);
        }
        
        return results;
      });
    }),
});

// Utility function for data validation
function validateCellValue(value: string, columnType: "TEXT" | "NUMBER"): string {
  if (value.trim() === "") {
    return "";
  }

  switch (columnType) {
    case "TEXT":
      // For TEXT columns, any string is valid
      return value;
      
    case "NUMBER":
      // For NUMBER columns, validate that it's a valid number
      const trimmedValue = value.trim();
      
      // Allow negative numbers, decimals, and scientific notation
      const numberRegex = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
      
      if (!numberRegex.test(trimmedValue)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid number format. Please enter a valid number (e.g., 123, -45.67, 1.2e-3)",
        });
      }

      // Additional validation: ensure it can be parsed as a number
      const parsedNumber = parseFloat(trimmedValue);
      if (isNaN(parsedNumber) || !isFinite(parsedNumber)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid number format. Please enter a valid number",
        });
      }

      // Return the trimmed value (but keep as string for storage)
      return trimmedValue;
      
    default:
      return value;
  }
}

// Helper function to format numbers for display (optional)
export function formatNumberValue(value: string): string {
  if (!value || value.trim() === "") return "";
  
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  
  // Format large numbers with commas for better readability
  if (Math.abs(num) >= 1000) {
    return num.toLocaleString();
  }
  
  return value;
}