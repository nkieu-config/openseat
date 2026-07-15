import {
  createParamDecorator,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';
import type { RequestUser } from './current-user.decorator';

@Injectable()
export class GqlAuthGuard extends AuthGuard('jwt') {
  getRequest(context: ExecutionContext) {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext<{ req: unknown }>().req;
  }
}

export const GqlCurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser | null => {
    const ctx = GqlExecutionContext.create(context);
    return ctx.getContext<{ req: { user?: RequestUser } }>().req.user ?? null;
  },
);
