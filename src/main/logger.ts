import log from 'electron-log/main'

log.transports.file.level = 'info'
log.transports.console.level = 'debug'
log.errorHandler.startCatching()

export default log
