import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ method: string; url: string }>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: unknown = 'Internal server error';
    let code: string | undefined;
    if (exception instanceof HttpException) {
      const r = exception.getResponse();
      if (typeof r === 'string') message = r;
      else {
        const obj = r as Record<string, unknown>;
        message = obj.message ?? exception.message;
        code = obj.code as string | undefined;
      }
    }

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.url} ${status}`,
        (exception as Error)?.stack,
      );
    }

    res.status(status).json({
      statusCode: status,
      code, // e.g. PROFILE_INCOMPLETE, when present
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
