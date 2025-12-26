import { describe, it, expect } from 'vitest';
import { IniParser } from '../docs/js/xcom-logic.js';

describe('INI Parsing and Generation Logic', () => {
    it('should correctly parse an INI with mixed types (arrays, maps, strings)', () => {
        const input = `[Section1]
key1=val1
key2[0]=mapval0
key2[1]=mapval1
array1=aval1
array1=aval2 ; with comment
`;
        const config = IniParser.parse(input);

        expect(config.Section1.key1).toEqual(['val1']);
        expect(config.Section1.key2['0']).toBe('mapval0');
        expect(config.Section1.key2['1']).toBe('mapval1');
        expect(config.Section1.array1).toEqual(['aval1', 'aval2; with comment']);
    });

    it('should perform a lossless round-trip for standard values', () => {
        const original = `[Section]
SimpleKey=SimpleValue
ArrayKey=Value1
ArrayKey=Value2
MapKey[0]=First
MapKey[1]=Second

`;
        const parsed = IniParser.parse(original);
        const generated = IniParser.generate(parsed);

        // Normalize whitespace for comparison
        const normalize = s => s.trim().replace(/\r\n/g, '\n');
        expect(normalize(generated)).toBe(normalize(original));
    });

    it('should preserve existing values when only one field in a struct is changed', () => {
        // This simulates a user editing a single field in the UI
        const originalStruct = "(MainAlien=eChar_Sectoid,PodChance=50,MinAliens=3,MaxAliens=5)";

        // 1. Parse struct to KV pairs (how the UI does it)
        const kv = IniParser.parseStructKV(originalStruct);

        // 2. Modify one value
        const target = kv.find(x => x.k === 'PodChance');
        target.v = "75";

        // 3. Reconstruct (how index.html:796 does it)
        const updatedStruct = "(" + kv.map(x => `${x.k}=${x.v}`).join(',') + ")";

        expect(updatedStruct).toContain('MainAlien=eChar_Sectoid');
        expect(updatedStruct).toContain('PodChance=75');
        expect(updatedStruct).toContain('MinAliens=3');
        expect(updatedStruct).toContain('MaxAliens=5');

        // Ensure no data loss
        const reparsed = IniParser.parseStructToObj(updatedStruct);
        expect(reparsed.MainAlien).toBe('eChar_Sectoid');
        expect(reparsed.PodChance).toBe('75');
        expect(reparsed.MaxAliens).toBe('5');
    });

    it('should correctly parse and generate structs within arrays', () => {
        const input = `[XComStrategyAIMutator.XGStrategyAI_Mod]
PossibleSoldiers=(MainAlien=eChar_Sectoid,PodChance=100)
PossibleSoldiers=(MainAlien=eChar_Muton,PodChance=50)
`;
        const config = IniParser.parse(input);
        const generated = IniParser.generate(config);

        const normalize = s => s.trim().replace(/\r\n/g, '\n');
        expect(normalize(generated)).toBe(normalize(input));
    });

    it('should handle property comments and include them in the generated output', () => {
        const input = `[Rules]
EnableScaling=true ; This is important
`;
        const config = IniParser.parse(input);
        const generated = IniParser.generate(config);

        expect(generated).toContain('EnableScaling=true; This is important');
    });
});
