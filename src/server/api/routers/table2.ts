// server/api/routers/table.ts
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

// Column Procedures - Optimized
export const columnRouter = createTRPCRouter({
  getByTableId: protectedProcedure
    .input(z.object({ tableId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Optimized ownership check - only select what we need
      const table = await ctx.db.table.findFirst({
        where: { id: input.tableId },
        select: {
          id: true,
          base: {
            select: {
              userId: true
            }
          }
        },
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
      // Use transaction for atomic operations
      return await ctx.db.$transaction(async (tx) => {
        // Verify ownership with optimized query
        const table = await tx.table.findFirst({
          where: { id: input.tableId },
          select: {
            id: true,
            base: {
              select: {
                userId: true
              }
            }
          },
        });

        if (!table || table.base.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        // Get the next position
        const lastColumn = await tx.column.findFirst({
          where: { tableId: input.tableId },
          select: { position: true },
          orderBy: { position: "desc" },
        });

        const newColumn = await tx.column.create({
          data: {
            name: input.name,
            type: (input.type ?? "TEXT"),
            tableId: input.tableId,
            position: (lastColumn?.position ?? -1) + 1,
          },
        });

        // Create cells for this new column in all existing rows
        const existingRows = await tx.row.findMany({
          where: { tableId: input.tableId },
          select: { id: true }, // Only select what we need
        });

        if (existingRows.length > 0) {
          await tx.cell.createMany({
            data: existingRows.map(row => ({
              rowId: row.id,
              columnId: newColumn.id,
              value: "",
            })),
          });
        }

        return newColumn;
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const column = await ctx.db.column.findFirst({
        where: { id: input.id },
        select: {
          id: true,
          table: {
            select: {
              base: {
                select: {
                  userId: true
                }
              }
            }
          }
        },
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

// Row Procedures - Optimized
export const rowRouter = createTRPCRouter({
  getByTableId: protectedProcedure
    .input(z.object({ tableId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const table = await ctx.db.table.findFirst({
        where: { id: input.tableId },
        select: {
          id: true,
          base: {
            select: {
              userId: true
            }
          }
        },
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
      return await ctx.db.$transaction(async (tx) => {
        // Verify ownership
        const table = await tx.table.findFirst({
          where: { id: input.tableId },
          select: {
            id: true,
            base: {
              select: {
                userId: true
              }
            }
          },
        });

        if (!table || table.base.userId !== ctx.session.user.id) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        // Get the next position
        const lastRow = await tx.row.findFirst({
          where: { tableId: input.tableId },
          select: { position: true },
          orderBy: { position: "desc" },
        });

        // Create the row
        const newRow = await tx.row.create({
          data: {
            tableId: input.tableId,
            position: (lastRow?.position ?? -1) + 1,
          },
        });

        // Get all columns for this table
        const columns = await tx.column.findMany({
          where: { tableId: input.tableId },
          select: { id: true },
        });

        // Create cells for each column
        if (columns.length > 0) {
          await tx.cell.createMany({
            data: columns.map(column => ({
              rowId: newRow.id,
              columnId: column.id,
              value: "",
            })),
          });
        }

        // Return the row with cells
        return tx.row.findFirst({
          where: { id: newRow.id },
          include: {
            cells: {
              include: {
                column: true,
              },
            },
          },
        });
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const row = await ctx.db.row.findFirst({
        where: { id: input.id },
        select: {
          id: true,
          table: {
            select: {
              base: {
                select: {
                  userId: true
                }
              }
            }
          }
        },
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

// Cell Procedures - Optimized
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
        select: {
          id: true,
          table: {
            select: {
              base: {
                select: {
                  userId: true
                }
              }
            }
          }
        },
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
          updatedAt: new Date(),
        },
        create: {
          rowId: input.rowId,
          columnId: input.columnId,
          value: input.value,
        },
      });
    }),
});