class BookshelfError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) Error.captureStackTrace(this, new.target);
  }
}

export class NotFoundError extends BookshelfError {}
export class EmptyError extends BookshelfError {}
export class NoRowsUpdatedError extends BookshelfError {}
export class NoRowsDeletedError extends BookshelfError {}
export class ModelNotResolvedError extends BookshelfError {}
