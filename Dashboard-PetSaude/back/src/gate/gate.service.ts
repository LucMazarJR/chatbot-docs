import { Injectable } from '@nestjs/common';

@Injectable()
export class GateService {
    unlock(name: string, pass: string) {
        const expected = process.env.SITE_PASSWORD || 'petsaude2026';
        if (pass !== expected) {
            return { ok: false, reason: 'invalid' };
        }
        return { ok: true, name };
    }
}
