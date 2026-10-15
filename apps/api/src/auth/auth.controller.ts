import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { PublicUser, SigninInput, SignupInput } from "@easygen/auth-contract";
import { ApiHttpError } from "../common/api-error.filter.js";
import type { ApiConfig } from "../config.js";
import { clearSessionCookieOptions, sessionCookieConfiguration } from "../session/cookie.js";
import { AuthService } from "./auth.service.js";
import { SigninValidationPipe, SignupValidationPipe } from "./validation.pipe.js";
import { Public } from "../session/session.guard.js";
import { SessionService } from "../session/session.service.js";

export const AUTH_API_CONFIG = Symbol("AUTH_API_CONFIG");

function detachSession(request: Request, response: Response, nodeEnv: ApiConfig["nodeEnv"]): void {
  Object.defineProperty(request, "session", { configurable: true, writable: true, value: undefined });
  response.clearCookie(
    sessionCookieConfiguration(nodeEnv).name,
    clearSessionCookieOptions(nodeEnv),
  );
}

@Controller("api/auth")
export class AuthController {
  constructor(
    @Inject(AUTH_API_CONFIG) private readonly config: Readonly<ApiConfig>,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post("signup")
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body(new SignupValidationPipe()) input: SignupInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.signup(input);
    await this.sessions.establish(request, response, user.id);
    response.setHeader("Cache-Control", "no-store");
    return { user };
  }

  @Public()
  @Post("signin")
  @HttpCode(HttpStatus.OK)
  async signin(
    @Body(new SigninValidationPipe()) input: SigninInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.signin(input);
    await this.sessions.establish(request, response, user.id);
    response.setHeader("Cache-Control", "no-store");
    return { user };
  }

  @Get("me")
  async me(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const userId = request.authUserId;
    if (!userId) throw new ApiHttpError("UNAUTHENTICATED");
    let user: PublicUser;
    try {
      user = await this.auth.getPublicUser(userId);
    } catch (error) {
      if (error instanceof ApiHttpError && error.code === "UNAUTHENTICATED") {
        detachSession(request, response, this.config.nodeEnv);
      }
      throw error;
    }
    await this.sessions.renew(request, response);
    response.setHeader("Cache-Control", "no-store");
    return { user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.destroy(request, response);
    response.setHeader("Cache-Control", "no-store");
  }
}
