import { Module } from '@nestjs/common';
import { AdmissionGuard } from './admission.guard';

@Module({
  providers: [AdmissionGuard],
  exports: [AdmissionGuard],
})
export class AdmissionModule {}
