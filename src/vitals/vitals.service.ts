import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateVitalsDto } from './dtos/create-vitals.dto';
import { QueryVitalsDto } from './dtos/query-vitals.dto';
import {
  VITAL_PARAMETER_FIELD_MAP,
  VitalField,
  VitalParameter,
} from './enums/vital-parameter.enum';
import { TrendsQueryDto } from './dtos/trends-query.dto';
import { UpdateVitalsDto } from './dtos/update-vitals.dto';

@Injectable()
export class VitalsService {
  private readonly logger = new Logger(VitalsService.name);
  constructor(private readonly prismaService: PrismaService) {}

  async createVitals(userId: string, vitalsDto: CreateVitalsDto) {
    const hasAtLeastOneVital = Object.values(vitalsDto).some(
      (v) => v !== undefined && v !== null,
    );
    if (!hasAtLeastOneVital)
      throw new BadRequestException(
        'At least one vital measurement is required',
      );

    if (
      (vitalsDto.diastolicBp && !vitalsDto.systolicBp) ||
      (vitalsDto.systolicBp && !vitalsDto.diastolicBp)
    )
      throw new BadRequestException(
        'User must input both diastolicBp and systolicBp, one can be inputted without the other.',
      );

    // Cross-field sanity check: diastolic should be lower than systolic
    if (
      vitalsDto.systolicBp !== undefined &&
      vitalsDto.diastolicBp &&
      vitalsDto.diastolicBp >= vitalsDto.systolicBp
    )
      throw new BadRequestException(
        'Diastolic BP must be lower than systolic BP',
      );

    return await this.prismaService.vital.create({
      data: { userId, ...vitalsDto },
    });
  }

  async getAllVitals(userId: string, queryVitalDto: QueryVitalsDto) {
    const { from, to, limit = 50, parameter } = queryVitalDto;

    return await this.prismaService.vital.findMany({
      where: {
        userId,
        ...(from || to
          ? {
              recordedAt: {
                ...(from && { gte: from }),
                ...(to && { lte: to }),
              },
            }
          : {}),
        ...(parameter && {
          [VITAL_PARAMETER_FIELD_MAP[parameter]]: { not: null },
        }),
      },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
  }

  async getLatest(userId: string) {
    const parameters = Object.values(VitalParameter);

    const results = await Promise.all(
      parameters.map(async (parameter) => {
        const field: VitalField = VITAL_PARAMETER_FIELD_MAP[parameter];
        const record = await this.prismaService.vital.findFirst({
          where: {
            userId,
            [field]: { not: null },
          },
          orderBy: { recordedAt: 'desc' },
        });

        return {
          parameter,
          value: record ? record[field] : null,
          recordedAt: record?.recordedAt ?? null,
          vitalId: record?.id ?? null,
        };
      }),
    );
    return results;
  }

  async getTrends(userId: string, query: TrendsQueryDto) {
    const { parameter, days = 7 } = query;
    const field = VITAL_PARAMETER_FIELD_MAP[parameter];

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const records = await this.prismaService.vital.findMany({
      where: {
        userId,
        recordedAt: { gte: since },
        [field]: { not: null },
      },
      orderBy: { recordedAt: 'asc' },
    });

    // Group by calender day (yyyy-mm-dd)
    const buckets = new Map<string, number[]>();
    for (const record of records) {
      const day = record.recordedAt.toISOString().slice(0, 10);
      const value = record[field] as number;
      if (!buckets.has(day)) buckets.set(day, []);
      buckets.get(day)!.push(value);
    }

    const points = Array.from(buckets.entries())
      .map(([date, values]) => ({
        date,
        avg: Number(
          (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2),
        ),
        min: Math.min(...values),
        max: Math.max(...values),
        count: values.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { parameter, days, points };
  }

  async updateVitals(
    userId: string,
    vitalId: string,
    updateVitalsDto: UpdateVitalsDto,
  ) {
    if (Object.keys(updateVitalsDto).length === 0) {
      throw new BadRequestException('No fields provided to update');
    }

    const existingVital = await this.prismaService.vital.findUnique({
      where: { id: vitalId },
    });
    if (!existingVital) throw new NotFoundException('Vital reading not found');
    if (existingVital.userId !== userId) {
      throw new ForbiddenException('You do not own this vital reading');
    }

    return await this.prismaService.vital.update({
      where: { id: vitalId },
      data: updateVitalsDto,
    });
  }

  async deleteVitals(userId: string, vitalId: string) {
    const existingVital = await this.prismaService.vital.findUnique({
      where: { id: vitalId },
    });

    if (!existingVital) throw new NotFoundException('Vital reading not found');
    if (existingVital.userId !== userId) {
      throw new ForbiddenException('You do not own this vital reading');
    }

    await this.prismaService.vital.delete({ where: { id: vitalId } });
    return { deleted: true };
  }
}
