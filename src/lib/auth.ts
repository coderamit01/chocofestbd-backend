import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { prisma } from "./prisma";
import { UserRole } from "../generated/prisma/enums";

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      role: {
        type: Object.values(UserRole),
        required: false,
        input: false,
      },
      phone: {
        type: "string",
        required: false,
      },
      isBanned: {
        type: "boolean",
        input: false
      },
      points: {
        type: "number",
        required: false,
        input: false,
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { isBanned: true, deletedAt: true },
          });

          if (!user || user.deletedAt) {
            throw new APIError("FORBIDDEN", { message: "This account no longer exists" });
          }
          if (user.isBanned) {
            throw new APIError("FORBIDDEN", { message: "Your account has been suspended" });
          }
        },
      },
    },
  },
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-up/email": {
        window: 3600,
        max: 5
      },
      "/sign-in/email": {
        window: 60,
        max: 5
      },
      "/get-session": false,
    }
  }
});
