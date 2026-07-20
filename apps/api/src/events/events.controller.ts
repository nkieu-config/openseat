import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, type RequestUser } from '../auth/current-user.decorator';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/guards';
import { CreateEventDto, CreateTicketTypeDto } from './dto/create-event.dto';
import { UpdateEventDto, UpdateTicketTypeDto } from './dto/update-event.dto';
import { EventsService } from './events.service';
import {
  EventDetailDto,
  MyEventDto,
  TicketTypePublicDto,
} from './dto/event-response.dto';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiCreatedResponse({ type: EventDetailDto })
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateEventDto) {
    return this.events.create(user.id, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: [MyEventDto] })
  listMine(@CurrentUser() user: RequestUser) {
    return this.events.listMine(user.id);
  }

  @Get(':slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOkResponse({ type: EventDetailDto })
  getBySlug(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser | null,
  ) {
    return this.events.getBySlug(slug, user?.id ?? null);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: EventDetailDto })
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
  @ApiCreatedResponse({ type: EventDetailDto })
  publish(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.events.publish(id, user.id);
  }

  @Post(':id/ticket-types')
  @ApiCreatedResponse({ type: TicketTypePublicDto })
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
  @ApiOkResponse({ type: TicketTypePublicDto })
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
