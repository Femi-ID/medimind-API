import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class OutputValidatorService {
  private readonly logger = new Logger(OutputValidatorService.name);

  // Prescription-only drugs. OTC drugs (paracetamol, ibuprofen, ORS,
  // antacids, antihistamines) are intentionally NOT here — the assistant
  // is allowed to give standard OTC dosing.
  private readonly prescriptionDrugs = [
    'amoxicillin',
    'ampicillin',
    'augmentin',
    'azithromycin',
    'ciprofloxacin',
    'ceftriaxone',
    'metronidazole',
    'flagyl',
    'doxycycline',
    'artemether',
    'lumefantrine',
    'coartem',
    'artesunate',
    'metformin',
    'insulin',
    'glibenclamide',
    'amlodipine',
    'lisinopril',
    'losartan',
    'atenolol',
    'hydrochlorothiazide',
    'warfarin',
    'tramadol',
    'codeine',
    'diazepam',
    'prednisolone',
  ];

  private readonly doseCore = /\d+(?:\.\d+)?\s?(?:mg|mcg|g|ml|iu|units?)\b/i;

  // Definitive-diagnosis patterns.
  private readonly diagnosisPatterns: RegExp[] = [
    /\byou (?:are|have been|'?ve been) diagnosed with\b/i,
    /\byou (?:definitely|certainly|clearly|most likely|probably) have\b/i,
    /\byou (?:have|'?ve got)\s+(?:\w+\s+){0,3}(?:hypertension|diabetes|malaria|typhoid|pneumonia|ulcer|cancer|tuberculosis|stroke|heart disease|kidney disease|hepatitis)\b/i,
  ];

  private readonly prescriptionInstruction =
    /\bi (?:prescribe|am prescribing|recommend (?:you )?take|will prescribe)\b/i;

  validate(text: string): { ok: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const lower = text.toLowerCase();

    const mentionedRx = this.prescriptionDrugs.filter((d) => lower.includes(d));
    if (mentionedRx.length > 0 && this.doseCore.test(text)) {
      reasons.push(`prescription drug + dose (${mentionedRx.join(', ')})`);
    }
    if (this.diagnosisPatterns.some((re) => re.test(text))) {
      reasons.push('definitive diagnostic statement');
    }
    if (this.prescriptionInstruction.test(text)) {
      reasons.push('prescription-shaped instruction');
    }

    return { ok: reasons.length === 0, reasons };
  }
}
