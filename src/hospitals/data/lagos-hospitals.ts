// src/hospitals/data/lagos-hospitals.ts
export interface SeedHospital {
  placeId: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  facilityType:
    'teaching_hospital' | 'general_hospital' | 'clinic' | 'pharmacy';
  hasEmergency: boolean;
  rating: number | null;
  openNow: boolean | null;
  phone: string | null;
}

export const LAGOS_HOSPITALS: SeedHospital[] = [
  {
    placeId: 'stub-luth',
    name: 'Lagos University Teaching Hospital (LUTH)',
    latitude: 6.517,
    longitude: 3.358,
    address: 'Idi-Araba, Surulere, Lagos',
    facilityType: 'teaching_hospital',
    hasEmergency: true,
    rating: 4.1,
    openNow: true,
    phone: '+234-1-000-0001',
  },
  {
    placeId: 'stub-gbagada',
    name: 'Gbagada General Hospital',
    latitude: 6.545,
    longitude: 3.386,
    address: 'Gbagada, Lagos',
    facilityType: 'general_hospital',
    hasEmergency: true,
    rating: 3.9,
    openNow: true,
    phone: '+234-1-000-0002',
  },
  {
    placeId: 'stub-reddington',
    name: 'Reddington Hospital',
    latitude: 6.4281,
    longitude: 3.4219,
    address: 'Victoria Island, Lagos',
    facilityType: 'general_hospital',
    hasEmergency: true,
    rating: 4.3,
    openNow: true,
    phone: '+234-1-000-0003',
  },
  {
    placeId: 'stub-stnicholas',
    name: 'St. Nicholas Hospital',
    latitude: 6.4498,
    longitude: 3.4026,
    address: 'Lagos Island, Lagos',
    facilityType: 'general_hospital',
    hasEmergency: true,
    rating: 4.2,
    openNow: true,
    phone: '+234-1-000-0004',
  },
  {
    placeId: 'stub-lagoonclinic',
    name: 'Lagoon Clinics',
    latitude: 6.438,
    longitude: 3.426,
    address: 'Ikoyi, Lagos',
    facilityType: 'clinic',
    hasEmergency: false,
    rating: 4.0,
    openNow: true,
    phone: '+234-1-000-0005',
  },
];
