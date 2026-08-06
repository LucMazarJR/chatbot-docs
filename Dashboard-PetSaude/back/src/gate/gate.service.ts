import { Injectable } from '@nestjs/common';

@Injectable()
export class GateService {
    private unlocked = false;
    private name: string | null = null;

    getStatus() {
        return {
            unlocked: Boolean(this.unlocked && this.name),
            name: this.name
        };
    }

    unlock(name: string, pass: string) {
        const expected = process.env.SITE_PASSWORD || 'petsaude2026';
        if (pass !== expected) {
            return { ok: false, reason: 'invalid' };
        }
        this.unlocked = true;
        this.name = name;
        return { ok: true, name };
    }

    lock() {
        this.unlocked = false;
        this.name = null;
        return { ok: true };
    }
}
