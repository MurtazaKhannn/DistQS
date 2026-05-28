require("dotenv").config();

const { Worker } = require("bullmq");
const { connection, QUEUE_NAME } = require("../queues/taskQueue");
const { taskRegistry } = require("../tasks");
const { prisma, disconnectPrisma } = require("../db/client");
const { truncateReason } = require("../services/jobService");
const { logger } = require("../utils/logger");

/**
 * Worker (consumer) — pulls jobs from Redis and runs task handlers asynchronously
 * (after the HTTP API has already responded to the client).
 */
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    const { dbJobId, ...payload } = job.data;
    if (!dbJobId) {
      throw new Error("Missing dbJobId in job payload");
    }

    const log = logger.child({
      dbJobId,
      queueJobId: job.id,
      type: job.name,
    });

    const handler = taskRegistry[job.name];
    if (!handler) {
      throw new Error(`Unknown job name: ${job.name}`);
    }

    log.info(
      {
        event: "job_started",
        attempts: job.attemptsMade,
      },
      "job started"
    );

    const start = Date.now();
    await handler(payload, { logger: log, job, dbJobId });
    const durationMs = Date.now() - start;

    await prisma.job.update({
      where: { id: dbJobId },
      data: {
        status: "completed",
        attempts: job.attemptsMade,
        completedAt: new Date(),
        failureReason: null,
      },
    });

    log.info(
      {
        event: "job_completed",
        durationMs,
        attempts: job.attemptsMade,
      },
      "job completed"
    );
  },
  { connection }
);

worker.on("active", (job) => {
  const dbJobId = job.data && job.data.dbJobId;
  if (!dbJobId) return;

  prisma.job
    .update({
      where: { id: dbJobId },
      data: {
        status: "active",
        attempts: job.attemptsMade ?? 0,
      },
    })
    .catch((err) => {
      logger.error({ err, dbJobId, event: "db_active_update_failed" }, "prisma update failed");
    });
});

worker.on("failed", async (job, err) => {
  if (!job || !job.data || !job.data.dbJobId) return;

  const dbJobId = job.data.dbJobId;
  const reason = truncateReason(err && err.message ? err.message : String(err));
  const attempts = job.attemptsMade ?? 0;
  const isFinal = Boolean(job.finishedOn);

  const log = logger.child({
    dbJobId,
    queueJobId: job.id,
    type: job.name,
  });

  try {
    if (isFinal) {
      await prisma.job.update({
        where: { id: dbJobId },
        data: {
          status: "failed",
          failureReason: reason,
          attempts,
          completedAt: new Date(),
        },
      });
      log.error(
        {
          event: "job_failed",
          attempts,
          isFinal: true,
          err: reason,
        },
        "job failed (final)"
      );
    } else {
      await prisma.job.update({
        where: { id: dbJobId },
        data: {
          status: "retrying",
          failureReason: reason,
          attempts,
        },
      });
      log.warn(
        {
          event: "job_retrying",
          attempts,
          err: reason,
        },
        "job failed; will retry"
      );
    }
  } catch (e) {
    log.error({ err: e, event: "db_failure_update_failed" }, "could not persist failure state");
  }
});

logger.info(
  {
    event: "worker_listen",
    queue: QUEUE_NAME,
    redis: `${connection.host}:${connection.port}`,
  },
  "Worker (consumer) started"
);

async function shutdown() {
  logger.info({ event: "worker_shutdown" }, "closing worker");
  await worker.close();
  await disconnectPrisma();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
