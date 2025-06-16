import { get } from "http";
import { z } from "zod";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";


export const baseRouter = createTRPCRouter({

  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.base.findMany({
        where: {
          userId: ctx.session?.user.id,   
        }
    });
  }),
});