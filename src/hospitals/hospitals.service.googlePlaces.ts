import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LAGOS_HOSPITALS, SeedHospital } from './data/lagos-hospitals';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateReferralDto } from './dto/create-referral.dto';

export type Severity = 'low' | 'moderate' | 'high';
export interface Hospital extends SeedHospital {
  distanceKm: number | null;
}

interface CacheEntry {
  expires: number;
  data: SeedHospital[];
}

@Injectable()
export class HospitalsService {
  private readonly logger = new Logger(HospitalsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
  private readonly PLACES_URL =
    'https://places.googleapis.com/v1/places:searchNearby';

  constructor(
    private readonly prismaService: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async nearby(
    lat: number,
    lng: number,
    severity: Severity,
    radiusKm = 15,
    limit = 3,
  ): Promise<Hospital[]> {
    // Real data when a key is configured; otherwise the seed list.
    const source = await this.resolveSource(lat, lng, radiusKm);

    return source
      .filter((h) => this.matchesSeverity(h, severity))
      .map((h) => ({
        ...h,
        distanceKm: this.haversineKm(lat, lng, h.latitude, h.longitude),
      }))
      .filter((h) => h.distanceKm !== null && h.distanceKm <= radiusKm)
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
      .slice(0, limit);
  }

  /**
   * Returns hospital candidates from Google Places when GOOGLE_PLACES_API_KEY
   * is set and reachable; falls back to the Lagos seed list on missing key,
   * timeout, or any API error. Never throws — hospital lookup must not break
   * a consultation reply.
   */
  private async resolveSource(
    lat: number,
    lng: number,
    radiusKm: number,
  ): Promise<SeedHospital[]> {
    const apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) return LAGOS_HOSPITALS;

    const cacheKey = `${lat.toFixed(2)}:${lng.toFixed(2)}:${radiusKm}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expires > Date.now()) return hit.data;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(this.PLACES_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': [
            'places.id',
            'places.displayName',
            'places.location',
            'places.formattedAddress',
            'places.rating',
            'places.currentOpeningHours.openNow',
            'places.nationalPhoneNumber',
            'places.types',
          ].join(','),
        },
        body: JSON.stringify({
          includedTypes: ['hospital'],
          maxResultCount: 15,
          rankPreference: 'DISTANCE',
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: Math.min(radiusKm * 1000, 50000),
            },
          },
        }),
      }).finally(() => clearTimeout(timer));

      if (!res.ok) {
        this.logger.warn(
          `Places API ${res.status}; falling back to seed list.`,
        );
        return LAGOS_HOSPITALS;
      }

      const json = (await res.json()) as { places?: PlaceResult[] };
      const mapped = (json.places ?? []).map((p) => this.mapPlace(p));
      if (mapped.length === 0) return LAGOS_HOSPITALS;

      this.cache.set(cacheKey, {
        expires: Date.now() + this.CACHE_TTL_MS,
        data: mapped,
      });
      return mapped;
    } catch (err) {
      this.logger.warn(
        `Places lookup failed (${(err as Error).message}); using seed list.`,
      );
      return LAGOS_HOSPITALS;
    }
  }

  private mapPlace(p: PlaceResult): SeedHospital {
    const types = p.types ?? [];
    const isPharmacy =
      types.includes('pharmacy') || types.includes('drugstore');
    const isHospital = types.includes('hospital');
    return {
      placeId: p.id,
      name: p.displayName?.text ?? 'Unknown facility',
      latitude: p.location?.latitude ?? 0,
      longitude: p.location?.longitude ?? 0,
      address: p.formattedAddress ?? '',
      facilityType: isPharmacy
        ? 'pharmacy'
        : isHospital
          ? 'general_hospital'
          : 'clinic',
      // Places doesn't expose an ER flag; treat hospitals as emergency-capable.
      hasEmergency: isHospital,
      rating: p.rating ?? null,
      openNow: p.currentOpeningHours?.openNow ?? null,
      phone: p.nationalPhoneNumber ?? null,
    };
  }

  async recordReferral(userId: string, dto: CreateReferralDto) {
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
    const R = 6371;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(latitude2 - latitude1);
    const dLon = toRad(longitude2 - longitude1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(latitude1)) *
        Math.cos(toRad(latitude2)) *
        Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }
}

interface PlaceResult {
  id: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  rating?: number;
  currentOpeningHours?: { openNow?: boolean };
  nationalPhoneNumber?: string;
  types?: string[];
}
