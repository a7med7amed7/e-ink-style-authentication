import { Injectable, SetMetadata, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { SessionService } from "./session.service.js";

const PUBLIC_ROUTE = "easygen.public-route";
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE, true);

declare module "express-serve-static-core" {
  interface Request {
    authUserId?: string;
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    request.authUserId = this.sessions.requireSession(request, response);
    return true;
  }
}
