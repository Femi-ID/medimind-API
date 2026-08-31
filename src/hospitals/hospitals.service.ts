import { Injectable } from '@nestjs/common';
import { LAGOS_HOSPITALS, SeedHospital } from './data/lagos-hospitals';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReferralDto } from './dto/create-referral.dto';

// NOTE: i need to look at caching the hospital locations in lagos, since focus is on lagos

export type Severity = 'low' | 'moderate' | 'high';
export interface Hospital extends SeedHospital {
  distanceKm: number | null;
}

@Injectable()
export class HospitalsService {
  constructor(private readonly prismaService: PrismaService) {}

  async nearby(
    lat: number,
    lng: number,
    severity: Severity,
    radiusKm = 15,
    limit = 3,
  ): Promise<Hospital[]> {
    const filtered = LAGOS_HOSPITALS.filter((h) =>
      this.matchesSeverity(h, severity),
    );

    return filtered
      .map((h) => ({
        ...h,
        distanceKm: this.haversineKm(lat, lng, h.latitude, h.longitude),
      }))
      .filter((h) => h.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }

  async recordReferral(
    userId: string,
    // dto: {
    //   sessionId?: string;
    //   placeId: string;
    //   name: string;
    //   latitude: number;
    //   longitude: number;
    //   distance?: number;
    //   severity: string;
    // },
    dto: CreateReferralDto,
  ) {
    return await this.prismaService.hospitalReferral.create({
      data: { userId, ...dto },
    });
  }

  async listReferrals(userId: string) {
    return await this.prismaService.hospitalReferral.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private matchesSeverity(h: SeedHospital, severity: Severity): boolean {
    if (severity === 'high') return h.hasEmergency;
    if (severity === 'moderate') return h.facilityType !== 'pharmacy';
    return true;
  }

  private haversineKm(
    latitude1: number,
    longitude1: number,
    latitude2: number,
    longitude2: number,
  ): number {
    const R = 6371; // Earth's mean radius in km
    const toRad = (d: number) => (d * Math.PI) / 180; // converts degrees to radians, because JavaScript's trig functions (Math.sin, Math.cos) work in radians, not degrees
    const dLat = toRad(latitude2 - latitude1);
    const dLon = toRad(longitude2 - longitude1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(latitude1)) *
        Math.cos(toRad(latitude2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c * 10) / 10; // to 1 decimal place
  }
}
