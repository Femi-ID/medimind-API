import { Injectable } from '@nestjs/common';
import { EMERGENCY_PHRASES, HEIGHTENED_PHRASES } from './constants/safety';

@Injectable()
export class EmergencyGuardService {
  private readonly emergencyRegexes: RegExp[];
  private readonly heightenedRegexes: { term: string; re: RegExp }[];

  constructor() {
    this.emergencyRegexes = EMERGENCY_PHRASES.map((p) =>
      this.toBoundedRegex(p),
    );
    this.heightenedRegexes = HEIGHTENED_PHRASES.map((p) => ({
      term: p,
      re: this.toBoundedRegex(p),
    }));
  }

  evaluate(message: string): {
    isEmergency: boolean;
    heightenedTerms: string[];
  } {
    const normalized = this.normalize(message);
    const isEmergency = this.emergencyRegexes.some((re) => re.test(normalized));
    const heightenedTerms = isEmergency
      ? []
      : this.heightenedRegexes
          .filter((h) => h.re.test(normalized))
          .map((h) => h.term);
    return { isEmergency, heightenedTerms };
  }

  private normalize(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]|_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private toBoundedRegex(phrase: string): RegExp {
    const normalizedPhrase = this.normalize(phrase);
    const escaped = normalizedPhrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`);
  }
}
