const { prisma } = require("../db/client");
const { taskQueue } = require("../queues/taskQueue");
const { logger } = require("../utils/logger");

const MAX_FAILURE_REASON = 4000;

function truncateReason(msg) {
  if (!msg) return null;
  const s = String(msg);
  return s.length > MAX_FAILURE_REASON
    ? `${s.slice(0, MAX_FAILURE_REASON)}…`
    : s;
}

/**
 * Persist job in PostgreSQL, then enqueue to BullMQ (Redis).
 * If enqueue fails after insert, mark the row failed (no orphan "queued" row).
 */
async function createQueuedJob({ type, payload }) {
  const jobRow = await prisma.job.create({
    data: {
      type,
      status: "queued",
      payload,
      attempts: 0,
    },
  });

  const log = logger.child({
    dbJobId: jobRow.id,
    type,
    event: "job_persisted",
  });

  try {
    const bullJob = await taskQueue.add(type, {
      dbJobId: jobRow.id,
      ...payload,
    });

    await prisma.job.update({
      where: { id: jobRow.id },
      data: { queueJobId: String(bullJob.id) },
    });

    log.info({
      event: "job_queued",
      queueJobId: bullJob.id,
      status: "queued",
    });

    return {
      id: jobRow.id,
      queueJobId: String(bullJob.id),
      status: "queued",
    };
  } catch (err) {
    const reason = truncateReason(
      `enqueue_failed: ${err && err.message ? err.message : err}`
    );
    await prisma.job.update({
      where: { id: jobRow.id },
      data: {
        status: "failed",
        failureReason: reason,
        completedAt: new Date(),
      },
    });
    log.error(
      { err, event: "enqueue_failed", failureReason: reason },
      "failed to add job to BullMQ after DB insert"
    );
    throw err;
  }
}

async function getJobById(id) {
  return prisma.job.findUnique({ where: { id } });
}

module.exports = {
  createQueuedJob,
  getJobById,
  truncateReason,
};
