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
        // 1. Create the table
        const newTable = await tx.table.create({
          data: {
            name: input.name,
            baseId: input.baseId,
          },
        });

        // 2. Create columns in batch (MUCH faster than individual creates)
        const columnsData = [
          { name: "Name", type: "TEXT" as const, position: 0, tableId: newTable.id },
          { name: "Age", type: "NUMBER" as const, position: 1, tableId: newTable.id },
          { name: "Email", type: "TEXT" as const, position: 2, tableId: newTable.id },
        ];
        
        await tx.column.createMany({ data: columnsData });
        
        // Get created columns for cell creation
        const createdColumns = await tx.column.findMany({
          where: { tableId: newTable.id },
          orderBy: { position: "asc" }
        });

        // 3. Create rows in batch (MUCH faster than individual creates)
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

        // 4. Create all cells in ONE batch operation (HUGE performance gain)
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
        
        // Single batch create for all 9 cells
        await tx.cell.createMany({ data: cellsData });

        // 5. Return the complete table with all its data for frontend cache
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
        timeout: 10000, // 10 seconds timeout (double the default)
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
      // Verify ownership
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

// Cell Procedures
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
        include: { table: { include: { base: true } } },
      });

      if (!row || row.table.base.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Update or create the cell
      return ctx.db.cell.upsert({
        where: {
          rowId_columnId: {
            rowId: input.rowId,
            columnId: input.columnId,
          },
        },
        update: {
          value: input.value,
        },
        create: {
          rowId: input.rowId,
          columnId: input.columnId,
          value: input.value,
        },
      });
    }),
});