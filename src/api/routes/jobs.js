const express = require("express");
const { postJobBodySchema, formatZodError } = require("../../validators/jobValidators");
const { createQueuedJob, getJobById } = require("../../services/jobService");
const { logger } = require("../../utils/logger");
const { requireJwtAuth } = require("../middleware/requireJwtAuth");

const router = express.Router();

router.use(requireJwtAuth);

router.post("/jobs", async (req, res) => {
  const parsed = postJobBodySchema.safeParse(req.body);
  if (parsed.success) {
    logger.debug({ type: parsed.data.type, event: "job_post_validated" }, "POST /jobs");
  }
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: formatZodError(parsed.error),
    });
  }

  const { type, payload } = parsed.data;

  try {
    const created = await createQueuedJob({ type, payload });
    return res.status(200).json({
      success: true,
      id: created.id,
      jobId: created.id,
      queueJobId: created.queueJobId,
      status: created.status,
    });
  } catch {
    return res.status(500).json({
      success: false,
      error: "Failed to enqueue job.",
    });
  }
});

router.get("/jobs/:id", async (req, res) => {
  const { id } = req.params;
  const job = await getJobById(id);
  if (!job) {
    return res.status(404).json({ success: false, error: "Job not found." });
  }

  logger.debug({ dbJobId: job.id, event: "job_status_read" }, "GET /jobs/:id");

  return res.json({
    id: job.id,
    queueJobId: job.queueJobId,
    type: job.type,
    status: job.status,
    attempts: job.attempts,
    payload: job.payload,
    failureReason: job.failureReason,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
  });
});

module.exports = router;
