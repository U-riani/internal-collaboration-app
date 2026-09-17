import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { Server as SocketServer } from "socket.io";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { createS3Storage } from "./lib/minio.js";
import { HttpError } from "./lib/http-error.js";
import { userWithAccess } from "./lib/authz.js";
import { localStorage } from "./lib/local-storage.js";
import driveRoutes from "./routes/drive.js";
import roleRoutes from "./routes/roles.js";
import healthRoutes from "./routes/health.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import departmentRoutes from "./routes/departments.js";
import taskRoutes from "./routes/tasks.js";
import approvalRoutes from "./routes/approvals.js";
import conversationRoutes from "./routes/conversations.js";
import fileRoutes from "./routes/files.js";
import notificationRoutes from "./routes/notifications.js";

export async function buildApp(dependencies = {}) {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    requestIdHeader: "x-request-id",
    trustProxy: env.TRUST_PROXY_HOPS || false,
  });

  await app.register(cors, {
    origin: env.APP_ORIGIN.split(",").map((origin) => origin.trim()),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(jwt, { secret: env.JWT_ACCESS_SECRET });
  await app.register(multipart, {
    limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024, files: 1 },
  });
  await app.register(swagger, {
    openapi: {
      info: { title: "Internal Collaboration API", version: "0.2.0" },
      servers: [{ url: "/api/v1" }],
    },
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  app.decorate("prisma", dependencies.prisma ?? prisma);
  app.decorate("redis", dependencies.redis ?? redis);
  app.decorate(
    "minio",
    dependencies.minio ??
      (env.STORAGE_DRIVER === "local"
        ? localStorage(env.STORAGE_LOCAL_PATH)
        : await createS3Storage()),
  );
  app.decorate("io", null);
  app.decorateRequest("authUser", null);

  app.decorate("authenticate", async function authenticate(request) {
    try {
      const payload = await request.jwtVerify();
      if (!payload.sid)
        throw new HttpError(401, "AUTH_SESSION_REQUIRED", "Sign in again");
      const session = await app.prisma.session.findUnique({
        where: { id: payload.sid },
      });
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      )
        throw new HttpError(401, "AUTH_SESSION_EXPIRED", "Sign in again");
      const user = await app.prisma.user.findUnique({
        where: { id: payload.sub },
        include: userWithAccess,
      });
      if (!user || user.status !== "ACTIVE") {
        throw new HttpError(
          401,
          "AUTH_ACCOUNT_DISABLED",
          "Account is unavailable",
        );
      }
      request.authUser = user;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(401, "AUTH_REQUIRED", "Authentication is required");
    }
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    if (error.code === "P2002") {
      error.statusCode = 409;
      error.message = "This item already exists";
    }
    if (error.code === "P2003") {
      error.statusCode = 400;
      error.message = "A referenced item is unavailable";
    }
    if (error.code === "P2034") {
      error.statusCode = 409;
      error.message = "This item changed. Refresh and try again";
    }
    const statusCode =
      error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
    const code =
      error.code || (statusCode === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR");
    if (statusCode >= 500)
      request.log.error({ err: error }, "Unhandled request error");
    reply.status(statusCode).send({
      success: false,
      error: {
        code,
        message:
          statusCode === 500 ? "An unexpected error occurred" : error.message,
        details: error.details,
      },
      requestId: request.id,
    });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/api/v1/auth" });
  await app.register(userRoutes, { prefix: "/api/v1/users" });
  await app.register(departmentRoutes, { prefix: "/api/v1/departments" });
  await app.register(taskRoutes, { prefix: "/api/v1/tasks" });
  await app.register(approvalRoutes, { prefix: "/api/v1" });
  await app.register(conversationRoutes, { prefix: "/api/v1" });
  await app.register(driveRoutes, { prefix: "/api/v1/drive" });
  await app.register(roleRoutes, { prefix: "/api/v1" });
  await app.register(fileRoutes, { prefix: "/api/v1/files" });
  await app.register(notificationRoutes, { prefix: "/api/v1/notifications" });

  const io = new SocketServer(app.server, {
    path: "/socket.io",
    cors: {
      origin: env.APP_ORIGIN.split(",").map((value) => value.trim()),
      credentials: true,
    },
  });
  app.io = io;

  async function socketIdentity(payload) {
    if (!payload.sid) throw new Error("Session required");
    const session = await app.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== payload.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status !== "ACTIVE" ||
      payload.exp * 1000 <= Date.now()
    )
      throw new Error("Session expired");
    return session.user;
  }
  io.use(async (socket, next) => {
    try {
      const payload = app.jwt.verify(socket.handshake.auth?.token);
      socket.data.payload = payload;
      socket.data.user = await socketIdentity(payload);
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", async (socket) => {
    const user = socket.data.user;
    const expire = setTimeout(
      () => socket.disconnect(true),
      Math.max(1, socket.data.payload.exp * 1000 - Date.now()),
    );
    socket.join(`user:${user.id}`);
    socket.join(`session:${socket.data.payload.sid}`);
    socket.use(async (_event, next) => {
      try {
        await socketIdentity(socket.data.payload);
        next();
      } catch {
        socket.disconnect(true);
        next(new Error("Unauthorized"));
      }
    });
    const membership = async (id) => {
      if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return false;
      const member = await app.prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: { conversationId: id, userId: user.id },
        },
      });
      return member && !member.leftAt;
    };
    try {
      const memberships = await app.prisma.conversationMember.findMany({
        where: { userId: user.id, leftAt: null },
        select: { conversationId: true },
      });
      memberships.forEach(({ conversationId }) =>
        socket.join(`conversation:${conversationId}`),
      );
      await app.redis.set(`presence:${user.id}`, "online", "EX", 90);
    } catch (error) {
      app.log.error(error);
      socket.disconnect(true);
    }
    socket.on("presence:heartbeat", async () => {
      try {
        await app.redis.set(`presence:${user.id}`, "online", "EX", 90);
      } catch (error) {
        app.log.warn(error);
      }
    });
    socket.on("conversation:join", async (id) => {
      try {
        if (await membership(id)) socket.join(`conversation:${id}`);
      } catch (error) {
        app.log.warn(error);
      }
    });
    let lastTyping = 0;
    for (const event of ["message:typing:start", "message:typing:stop"])
      socket.on(event, async (payload) => {
        try {
          if (Date.now() - lastTyping < 300) return;
          lastTyping = Date.now();
          if (await membership(payload?.conversationId))
            socket.to(`conversation:${payload.conversationId}`).emit(event, {
              conversationId: payload.conversationId,
              userId: user.id,
              displayName: user.displayName,
            });
        } catch (error) {
          app.log.warn(error);
        }
      });
    socket.on("disconnect", async () => {
      clearTimeout(expire);
      try {
        if (!io.sockets.adapter.rooms.get(`user:${user.id}`)?.size) {
          await app.redis.del(`presence:${user.id}`);
          await app.prisma.user.update({
            where: { id: user.id },
            data: { lastSeenAt: new Date() },
          });
        }
      } catch (error) {
        app.log.warn(error);
      }
    });
  });

  app.addHook("onClose", async () => {
    io.disconnectSockets(true);
    if (!dependencies.prisma) await app.prisma.$disconnect();
    if (!dependencies.redis) await app.redis.quit();
    io.close();
  });

  return app;
}
