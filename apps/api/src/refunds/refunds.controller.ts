import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type RequestUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards';
import { CreateRefundDto } from './dto/create-refund.dto';
import { RefundsService } from './refunds.service';

@ApiTags('refunds')
@Controller()
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  @Post('events/:eventId/orders/:orderId/refunds')
  @HttpCode(201)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiHeader({ name: 'idempotency-key', required: false })
  async create(
    @Param('eventId') eventId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CreateRefundDto,
    @CurrentUser() user: RequestUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const { refund } = await this.refunds.create({
      eventId,
      orderId,
      ticketIds: dto.ticketIds,
      userId: user.id,
      idempotencyKey: idempotencyKey?.slice(0, 120) ?? null,
    });
    return refund;
  }

  @Post('refunds/:refundId/retry')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  retry(@Param('refundId') refundId: string, @CurrentUser() user: RequestUser) {
    return this.refunds.retry(refundId, user.id);
  }
}
