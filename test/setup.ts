process.on('unhandledRejection', (reason: unknown) => {
  // Match the old bluebird onPossiblyUnhandledRejection(err => throw err) contract
  throw reason;
});
