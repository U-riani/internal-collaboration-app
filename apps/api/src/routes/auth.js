import { z } from "zod";
import { env } from "../config/env.js";
import { parse } from "../lib/validation.js";
import { HttpError } from "../lib/http-error.js";
import {
  createRefreshToken,
  hashToken,
  verifyPassword,
  hashPassword,
} from "../lib/security.js";
import { publicUser, userWithAccess } from "../lib/authz.js";
import { audit } from "../lib/audit.js";

const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(8),
});

const refreshCookie = "collab_refresh_token";

function cookieOptions() {
  return {
    path: "/api/v1/auth",
    httpOnly: true,
    sameSite: "strict",
    secure: env.COOKIE_SECURE,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  };
}

function accessToken(app, user, sessionId) {
  return app.jwt.sign(
    { sub: user.id, sid: sessionId },
    { expiresIn: env.ACCESS_TOKEN_TTL },
  );
}

export default async function authRoutes(app) {
  app.post(
    "/password",
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const input = parse(
        z.object({
          currentPassword: z.string().min(1).max(200),
          newPassword: z.string().min(12).max(200),
        }),
        request.body,
      );
      const user = request.authUser;
      if (!(await verifyPassword(user.passwordHash, input.currentPassword)))
        throw new HttpError(
          400,
          "PASSWORD_INCORRECT",
          "Current password is incorrect",
        );
      if (input.currentPassword === input.newPassword)
        throw new HttpError(
          400,
          "PASSWORD_UNCHANGED",
          "Choose a different password",
        );
      const passwordHash = await hashPassword(input.newPassword);
      await app.prisma.$transaction(async (tx) => {
        const changed = await tx.user.updateMany({
          where: { id: user.id, passwordHash: user.passwordHash },
          data: { passwordHash },
        });
        if (changed.count !== 1)
          throw new HttpError(
            409,
            "PASSWORD_CHANGED",
            "Your password changed. Sign in again",
          );
        await tx.session.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            actionType: "PASSWORD_CHANGED",
            entityType: "USER",
            entityId: user.id,
          },
        });
      });
      app.io?.in(`user:${user.id}`).disconnectSockets(true);
      reply.clearCookie(refreshCookie, cookieOptions());
      return { success: true, data: null };
    },
  );

  app.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = parse(loginSchema, request.body);
      const user = await app.prisma.user.findUnique({
        where: { email: input.email },
        include: userWithAccess,
      });
      if (
        !user ||
        user.status !== "ACTIVE" ||
        !(await verifyPassword(user.passwordHash, input.password))
      ) {
        throw new HttpError(
          401,
          "AUTH_INVALID_CREDENTIALS",
          "Email or password is incorrect",
        );
      }

      const token = createRefreshToken();
      const session = await app.prisma.session.create({
        data: {
          userId: user.id,
          refreshTokenHash: hashToken(token),
          deviceName: request.headers["user-agent"]?.slice(0, 150),
          ipAddress: request.ip,
          userAgent: request.headers["user-agent"],
          expiresAt: new Date(
            Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000,
          ),
        },
      });
      reply.setCookie(refreshCookie, token, cookieOptions());
      request.authUser = user;
      await audit(app, request, {
        actionType: "AUTH_LOGIN",
        entityType: "USER",
        entityId: user.id,
      });
      return {
        success: true,
        data: {
          accessToken: accessToken(app, user, session.id),
          user: publicUser(user),
        },
      };
    },
  );

  app.post(
    "/refresh",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const token = request.cookies[refreshCookie];
      if (!token)
        throw new HttpError(
          401,
          "AUTH_REFRESH_REQUIRED",
          "Refresh session is missing",
        );
      const session = await app.prisma.session.findUnique({
        where: { refreshTokenHash: hashToken(token) },
        include: { user: { include: userWithAccess } },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.user.status !== "ACTIVE"
      ) {
        reply.clearCookie(refreshCookie, cookieOptions());
        throw new HttpError(
          401,
          "AUTH_REFRESH_INVALID",
          "Refresh session is invalid or expired",
        );
      }
      const nextToken = createRefreshToken();
      const consumed = await app.prisma.session.updateMany({
        where: {
          id: session.id,
          refreshTokenHash: hashToken(token),
          revokedAt: null,
        },
        data: {
          refreshTokenHash: hashToken(nextToken),
          expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000),
        },
      });
      if (consumed.count !== 1)
        throw new HttpError(
          401,
          "AUTH_REFRESH_USED",
          "Refresh token has already been used",
        );
      reply.setCookie(refreshCookie, nextToken, cookieOptions());
      return {
        success: true,
        data: {
          accessToken: accessToken(app, session.user, session.id),
          user: publicUser(session.user),
        },
      };
    },
  );

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[refreshCookie];
    if (token) {
      const session = await app.prisma.session.findUnique({
        where: { refreshTokenHash: hashToken(token) },
      });
      await app.prisma.session.updateMany({
        where: { refreshTokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (session) app.io?.in(`session:${session.id}`).disconnectSockets(true);
    }
    reply.clearCookie(refreshCookie, cookieOptions());
    return { success: true, data: null };
  });

  app.get("/me", { preHandler: app.authenticate }, async (request) => ({
    success: true,
    data: publicUser(request.authUser),
  }));
}
