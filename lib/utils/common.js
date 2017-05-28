// Singleton for globals!

module.exports = {
  randInt: Math.floor(Math.random() * 1000),
  SERVICE_CMD_REGEX: /server.*ready/i,
  REPO_CMD_REGEX: /server.*running/i
}
