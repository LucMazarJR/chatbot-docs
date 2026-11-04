import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) { }

  // Público de propósito: é o health check da hospedagem. Com o guard global
  // ligado e sem este decorator, a raiz passa a devolver 401 e o serviço
  // aparece como fora do ar.
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
