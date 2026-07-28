export enum VitalParameter {
  SYSTOLIC_BP = 'systolic_bp',
  DIASTOLIC_BP = 'diastolic_bp',
  HEART_RATE = 'heart_rate',
  WEIGHT = 'weight',
  BLOOD_GLUCOSE = 'blood_glucose',
}

export type VitalField =
  'systolicBp' | 'diastolicBp' | 'heartRate' | 'weight' | 'bloodGlucose';

export const VITAL_PARAMETER_FIELD_MAP: Record<VitalParameter, VitalField> = {
  [VitalParameter.SYSTOLIC_BP]: 'systolicBp',
  [VitalParameter.DIASTOLIC_BP]: 'diastolicBp',
  [VitalParameter.HEART_RATE]: 'heartRate',
  [VitalParameter.WEIGHT]: 'weight',
  [VitalParameter.BLOOD_GLUCOSE]: 'bloodGlucose',
};
