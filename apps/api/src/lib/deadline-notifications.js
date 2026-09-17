async function createNotification(prisma, data) {
  try {
    await prisma.notification.create({ data });
  } catch (error) {
    if (error.code !== "P2002") throw error;
  }
}

export async function scanTaskDeadlines(prisma) {
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
      await createNotification(prisma, {
        userId: task.assigneeId,
        type: "TASK_OVERDUE",
        title: "Task is overdue",
        body: task.title,
        relatedEntityType: "TASK",
        relatedEntityId: task.id,
        deduplicationKey: `task-overdue:${task.id}:${dateKey}`,
      });
    } else if (task.dueDate <= upcomingLimit) {
      await createNotification(prisma, {
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

  return tasks.length;
}

export function startDeadlineNotificationScheduler(
  prisma,
  log,
  intervalMs = 60_000,
) {
  let stopped = false;
  let running = false;

  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const scanned = await scanTaskDeadlines(prisma);
      log?.debug?.({ scanned }, "Task deadline scan completed");
    } catch (error) {
      log?.error?.({ err: error }, "Task deadline scan failed");
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(run, intervalMs);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
