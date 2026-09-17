import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const queueName = "collaboration-notifications";
const queue = new Queue(queueName, { connection });

async function createNotification(data) {
  try {
    await prisma.notification.create({ data });
  } catch (error) {
    if (error.code !== "P2002") throw error;
  }
}

const worker = new Worker(
  queueName,
  async (job) => {
    if (job.name !== "task-deadline-scan") return;
    const now = new Date();
    const upcomingLimit = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const dateKey = now.toISOString().slice(0, 10);

    const tasks = await prisma.task.findMany({
      where: {
        archivedAt: null,
        assigneeId: { not: null },
        dueDate: { not: null },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
      },
      select: { id: true, title: true, assigneeId: true, dueDate: true },
    });

    for (const task of tasks) {
      if (task.dueDate < now) {
        await createNotification({
          userId: task.assigneeId,
          type: "TASK_OVERDUE",
          title: "Task is overdue",
          body: task.title,
          relatedEntityType: "TASK",
          relatedEntityId: task.id,
          deduplicationKey: `task-overdue:${task.id}:${dateKey}`,
        });
      } else if (task.dueDate <= upcomingLimit) {
        await createNotification({
          userId: task.assigneeId,
          type: "TASK_DUE",
          title: "Task deadline is approaching",
          body: task.title,
          relatedEntityType: "TASK",
          relatedEntityId: task.id,
          deduplicationKey: `task-due:${task.id}:${dateKey}`,
        });
      }
    }
    return { scanned: tasks.length };
  },
  { connection, concurrency: 2 },
);

worker.on("completed", (job, result) =>
  console.log("Job completed", job.id, result),
);
worker.on("failed", (job, error) =>
  console.error("Job failed", job?.id, error),
);

async function enqueueScan() {
  const minute = new Date().toISOString().slice(0, 16);
  await queue.add(
    "task-deadline-scan",
    {},
    {
      jobId: `task-deadline-scan-${minute.replaceAll(":", "-")}`,
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
}

await enqueueScan();
const interval = setInterval(() => enqueueScan().catch(console.error), 60_000);

async function shutdown() {
  clearInterval(interval);
  await Promise.allSettled([
    worker.close(),
    queue.close(),
    connection.quit(),
    prisma.$disconnect(),
  ]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
console.log("Background worker started.");
