const { Queue } = require("bullmq");

/**
 * Redis connection — shared by Queue (producer) and Worker (consumer).
 * BullMQ persists queue state in Redis.
 */
const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
};

/** Logical queue name in Redis. */
const QUEUE_NAME = "task-queue";

/**
 * Queue — named channel where jobs wait until a worker consumes them.
 * defaultJobOptions: retries with exponential backoff (production-minded).
 */
const taskQueue = new Queue(QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

module.exports = {
  connection,
  QUEUE_NAME,
  taskQueue,
};
