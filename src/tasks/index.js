const { runEmailTask } = require("./emailTask");
const { runPdfTask } = require("./pdfTask");

/**
 * Dynamic task lookup — add new tasks here instead of a large switch in the worker.
 */
const taskRegistry = {
  email: runEmailTask,
  pdf: runPdfTask,
};

module.exports = { taskRegistry };
