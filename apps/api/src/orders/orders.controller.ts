import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type RequestUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('events/:eventId/orders')
  @HttpCode(201)
  @UseGuards(OptionalJwtAuthGuard)
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async create(
    @Param('eventId') eventId: string,
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: RequestUser | null,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const { order } = await this.orders.create({
      eventId,
      dto,
      buyerUserId: user?.id ?? null,
      idempotencyKey: idempotencyKey?.slice(0, 120) ?? null,
    });
    return order;
  }

  @Get('orders/:id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiQuery({ name: 'token', required: false })
  getById(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser | null,
    @Query('token') token?: string,
  ) {
    return this.orders.getById(id, {
      userId: user?.id ?? null,
      guestToken: token ?? null,
    });
  }

  @Get('me/tickets')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  listMyTickets(@CurrentUser() user: RequestUser) {
    return this.orders.listMyTickets(user.id);
  }
}
