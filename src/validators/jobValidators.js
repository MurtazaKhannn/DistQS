const { z } = require("zod");

/**
 * POST /jobs body: task type + payload validated before DB insert and enqueue.
 */
const postJobBodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("email"),
    payload: z.object({
      to: z.string().email(),
      subject: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal("pdf"),
    payload: z.object({
      title: z.string().min(1),
      data: z.record(z.string(), z.unknown()).optional(),
    }),
  }),
]);

function formatZodError(error) {
  return error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}

module.exports = { postJobBodySchema, formatZodError };
