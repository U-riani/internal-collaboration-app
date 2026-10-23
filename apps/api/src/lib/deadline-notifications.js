async function createNotification(prisma, data, onCreated) {
  if (data.deduplicationKey) {
    const result = await prisma.notification.createMany({
      data: [data],
      skipDuplicates: true,
    });
    if (result.count && onCreated) {
      const notification = await prisma.notification.findUnique({
        where: { deduplicationKey: data.deduplicationKey },
      });
      if (notification) onCreated(notification);
    }
    return;
  }
  const notification = await prisma.notification.create({ data });
  onCreated?.(notification);
}

export async function scanTaskDeadlines(prisma, onCreated) {
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
      }, onCreated);
    } else if (task.dueDate <= upcomingLimit) {
      await createNotification(prisma, {
        userId: task.assigneeId,
        type: "TASK_DUE",
        title: "Task deadline is approaching",
        body: task.title,
        relatedEntityType: "TASK",
        relatedEntityId: task.id,
        deduplicationKey: `task-due:${task.id}:${dateKey}`,
      }, onCreated);
    }
  }

  return tasks.length;
}

export function startDeadlineNotificationScheduler(
  prisma,
  log,
  intervalMs = 60_000,
  onCreated,
) {
  let stopped = false;
  let running = false;

  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      const scanned = await scanTaskDeadlines(prisma, onCreated);
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
