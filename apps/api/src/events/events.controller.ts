import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type RequestUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';
import { CreateEventDto, CreateTicketTypeDto } from './dto/create-event.dto';
import { UpdateEventDto, UpdateTicketTypeDto } from './dto/update-event.dto';
import { EventsService } from './events.service';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateEventDto) {
    return this.events.create(user.id, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  listMine(@CurrentUser() user: RequestUser) {
    return this.events.listMine(user.id);
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  getBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser | null,
  ) {
    return this.events.getBySlug(slug, user?.id ?? null);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.events.update(id, user.id, dto);
  }

  @Post(':id/publish')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  publish(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.events.publish(id, user.id);
  }

  @Post(':id/ticket-types')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  addTicketType(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateTicketTypeDto,
  ) {
    return this.events.addTicketType(id, user.id, dto);
  }

  @Patch(':id/ticket-types/:ticketTypeId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updateTicketType(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('ticketTypeId') ticketTypeId: string,
    @Body() dto: UpdateTicketTypeDto,
  ) {
    return this.events.updateTicketType(id, ticketTypeId, user.id, dto);
  }
}
