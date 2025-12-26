import { expect, test, describe } from 'vitest';
import { IniParser, SimEngine } from '../docs/js/xcom-logic.js';

describe('XCOM INI Parser', () => {
    test('should parse basic key-value pairs', () => {
        const ini = `[Section]\nKey=Value`;
        const result = IniParser.parse(ini);
        expect(result['Section']['Key']).toEqual(['Value']);
    });

    test('should handle array indexing', () => {
        const ini = `[Section]\nKey[0]=Value0\nKey[1]=Value1`;
        const result = IniParser.parse(ini);
        expect(result['Section']['Key']['0']).toBe('Value0');
        expect(result['Section']['Key']['1']).toBe('Value1');
    });

    test('should parse struct strings to objects', () => {
        const struct = '(MainAlien=eChar_Sectoid,MainChance=100)';
        const obj = IniParser.parseStructToObj(struct);
        expect(obj.MainAlien).toBe('eChar_Sectoid');
        expect(obj.MainChance).toBe('100');
    });

    test('should generate valid INI content', () => {
        const config = { 'Section': { 'Key': ['Value'] } };
        const result = IniParser.generate(config);
        expect(result).toContain('[Section]');
        expect(result).toContain('Key=Value');
    });
});

describe('XCOM Simulation Engine', () => {
    const mockConfig = {
        'XComStrategyAIMutator.XGStrategyAI_Mod': {
            'AbductionPodNumbers': ['(MinPods=3,MaxPods=3)'],
            'AbductionPodTypes': ['(ID=EPodTypeMod_Soldier,TypeChance=100)'],
            'PossibleSoldiers': ['(MainAlien=eChar_Sectoid,PodChance=100,MinAliens=3,MaxAliens=3)']
        }
    };

    test('should generate correct number of pods', () => {
        // difficulty: 2 is 'Moderate', so (2-2)*1 = 0 modifier. 3 + 0 = 3 pods.
        const result = SimEngine.run(mockConfig, {}, [], { mission: 'Abduction', month: 0, resources: 0, difficulty: 2 });
        expect(result.pods.length).toBe(3);
        expect(result.pods[0].category).toBe('Soldier');
    });

    test('should apply research upgrades to unit stats', () => {
        const base_stats = { 'eChar_Sectoid': { HP: "3", Offense: "65" } };
        const upgrades = [{ eType: 'eChar_Sectoid', iHP: "2", iAim: "10", iCritHit: "1015" }]; // Month 10 (Research 280+), +2HP, +10Aim

        // Month 11 (Research 308) should have the upgrade (3 + 2 = 5 HP, 65 + 10 = 75 Aim)
        const res = SimEngine.run(mockConfig, base_stats, upgrades, { mission: 'Abduction', month: 11, resources: 0, difficulty: 2 });
        const alien = res.pods[0].aliens[0];

        // Stats are now rolled with variance: HP +/- 1, Aim +/- 2
        expect(alien.hp).toBeGreaterThanOrEqual(4);
        expect(alien.hp).toBeLessThanOrEqual(6);
        expect(alien.aim).toBeGreaterThanOrEqual(73);
        expect(alien.aim).toBeLessThanOrEqual(77);
    });

    test('should respect PodLimit from .uc logic', () => {
        const limitConfig = {
            'XComStrategyAIMutator.XGStrategyAI_Mod': {
                'AbductionPodNumbers': ['(MinPods=10,MaxPods=10)'],
                'AbductionPodTypes': ['(ID=EPodTypeMod_Soldier,TypeChance=100)'],
                'PossibleSoldiers': ['(MainAlien=eChar_Sectoid,PodChance=100,PodLimit=2,MinAliens=1,MaxAliens=1)']
            }
        };
        const res = SimEngine.run(limitConfig, {}, [], { mission: 'Abduction', month: 0, resources: 0, difficulty: 2 });
        expect(res.pods.length).toBe(2);
    });

    test('should filter species based on PodDifficulty', () => {
        const diffConfig = {
            'XComStrategyAIMutator.XGStrategyAI_Mod': {
                'AbductionPodNumbers': ['(MinPods=1,MaxPods=1)'],
                'AbductionPodTypes': ['(ID=EPodTypeMod_Soldier,TypeChance=100)'],
                'PossibleSoldiers': [
                    '(MainAlien=eChar_Muton,PodChance=100,PodDifficulty=5,MinAliens=1,MaxAliens=1)',
                    '(MainAlien=eChar_Sectoid,PodChance=100,PodDifficulty=0,MinAliens=1,MaxAliens=1)'
                ]
            }
        };
        // Use difficulty 5 to allow Muton but Sectoid is still valid. Wait, it filters by difficulty correctly.
        const res = SimEngine.run(diffConfig, {}, [], { mission: 'Abduction', month: 0, resources: 0, difficulty: 2 });
        expect(res.pods.length).toBeGreaterThan(0);
        expect(res.pods[0].aliens[0].name).toContain('Sectoid');
    });
});

describe('XCOM Logic Resilience', () => {
    test('IniParser should not throw on empty/null input', () => {
        expect(() => IniParser.parse(null)).not.toThrow();
        expect(() => IniParser.parse("")).not.toThrow();
        expect(IniParser.parse("")).toEqual({});
    });

    test('SimEngine should not throw on empty config', () => {
        expect(() => SimEngine.run({}, {}, [], { mission: 'Abduction', month: 0, resources: 0 })).not.toThrow();
    });

    test('IniParser.parseStructToObj should handle malformed structs', () => {
        const malformed = "This is not a struct";
        expect(() => IniParser.parseStructToObj(malformed)).not.toThrow();
        expect(IniParser.parseStructToObj(malformed)).toEqual({});
    });
});
