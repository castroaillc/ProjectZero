import { Module } from "@nestjs/common";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { CredentialCipher } from "./credential-cipher";
import { CredentialsController } from "./credentials.controller";
import { CREDENTIAL_CIPHER, CredentialsService } from "./credentials.service";

@Module({
  controllers: [CredentialsController],
  providers: [
    {
      provide: CREDENTIAL_CIPHER,
      inject: [ENV],
      useFactory: (env: Env) =>
        new CredentialCipher({ key: env.CREDENTIALS_KEY, fallbackSecret: env.BETTER_AUTH_SECRET }),
    },
    CredentialsService,
  ],
  exports: [CredentialsService],
})
export class CredentialsModule {}
