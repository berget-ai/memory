export class MemoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "MemoryError";
  }
}

export class PathNotFoundError extends MemoryError {
  constructor(path: string) {
    super(`Path not found: ${path}`, "PATH_NOT_FOUND", 404);
    this.name = "PathNotFoundError";
  }
}

export class PathAlreadyExistsError extends MemoryError {
  constructor(path: string) {
    super(`Path already exists: ${path}`, "PATH_EXISTS", 409);
    this.name = "PathAlreadyExistsError";
  }
}

export class InvalidPathError extends MemoryError {
  constructor(path: string) {
    super(`Invalid path: ${path}`, "INVALID_PATH", 400);
    this.name = "InvalidPathError";
  }
}

export class PermissionDeniedError extends MemoryError {
  constructor(path: string) {
    super(`Permission denied: ${path}`, "PERMISSION_DENIED", 403);
    this.name = "PermissionDeniedError";
  }
}

export class InvalidCommandError extends MemoryError {
  constructor(command: string) {
    super(`Invalid command: ${command}`, "INVALID_COMMAND", 400);
    this.name = "InvalidCommandError";
  }
}

export class AuthenticationError extends MemoryError {
  constructor(message: string = "Authentication required") {
    super(message, "UNAUTHENTICATED", 401);
    this.name = "AuthenticationError";
  }
}
