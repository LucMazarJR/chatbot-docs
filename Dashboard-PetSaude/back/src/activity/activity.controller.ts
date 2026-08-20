import { Controller, Get, Query } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { ListActivityQueryDto } from './dto/list-activity-query.dto';

@Controller('activity')
export class ActivityController {
    constructor(private activityService: ActivityService) { }

    @Get()
    getActivities(@Query() query: ListActivityQueryDto) {
        return this.activityService.getRecentActivities(query);
    }
}
