export class ProjectLoadError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(message);
    this.name = "ProjectLoadError";
    this.code = code;
    this.path = path;
  }
}

export class ProjectBuildError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectBuildError";
    this.code = code;
  }
}
