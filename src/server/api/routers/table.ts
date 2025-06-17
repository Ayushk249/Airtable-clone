import { get } from "http";
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
          columns: true,
          rows: true,
        },
      });
    }),
});