import { TRPCError } from "@trpc/server";
import { z } from "zod";

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
      return ctx.db.table.create({
        data: {
          name: input.name,
          baseId: input.baseId,
        },
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
        ...(input.cursor ? {
          id: {
            gt: input.cursor, // Get rows after the cursor
          },
        } : {}),
      },
      include: {
        cells: {
          include: {
            column: true,
          },
        },
      },
      orderBy: { position: "asc" },
      take: input.limit + 1, // Take one extra to know if there's a next page
    });

    let nextCursor: string | undefined = undefined;
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
      // Verify the user owns the table
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
      // Verify the user owns the table
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