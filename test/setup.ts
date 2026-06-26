process.on('unhandledRejection', (reason) => {
  // Match the old bluebird onPossiblyUnhandledRejection(err => throw err) contract
  throw reason;
});
