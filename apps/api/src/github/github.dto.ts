import {
  GitHubAppInfoSchema,
  GitHubInstallationSchema,
  GitHubRepositorySchema,
  StartGitHubInstallSchema,
} from "@projectzero/shared";
import { createZodDto } from "nestjs-zod";

export class GitHubAppInfoDto extends createZodDto(GitHubAppInfoSchema) {}
export class GitHubInstallationDto extends createZodDto(GitHubInstallationSchema) {}
export class GitHubRepositoryDto extends createZodDto(GitHubRepositorySchema) {}
export class StartGitHubInstallDto extends createZodDto(StartGitHubInstallSchema) {}
