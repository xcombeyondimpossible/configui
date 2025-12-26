/**
 * XCOM Strategy AI - Pure Logic Module
 * Contains INI Parsing and Simulation Engine (No DOM or Vue dependencies)
 * 
 * Logic strictly validated against XGStrategyAI_Mod.uc
 */

export const IniParser = {
    parse(txt) {
        if (typeof txt !== 'string') console.error('IniParser.parse: expected string, got', typeof txt, txt);
        const conf = {}; let cur = null;
        if (!txt || typeof txt !== 'string') return conf;

        txt.split('\n').forEach(line => {
            let comment = "";
            if (line.includes(';')) { const p = line.split(';'); line = p[0]; comment = p.slice(1).join(';'); }
            line = line.trim(); if (!line) return;
            const sMatch = line.match(/^\[(.+)\]$/);
            if (sMatch) { cur = sMatch[1]; if (!conf[cur]) conf[cur] = {}; return; }
            if (line.includes('=') && cur) {
                let [k, ...v] = line.split('='); k = k.trim(); let val = v.join('=').trim();
                if (comment) val += ';' + comment;
                const aMatch = k.match(/^(.+)\[(\d+)\]$/);
                if (aMatch) { const bk = aMatch[1], i = aMatch[2]; if (!conf[cur][bk]) conf[cur][bk] = {}; conf[cur][bk][i] = val; }
                else { if (!conf[cur][k]) conf[cur][k] = []; conf[cur][k].push(val); }
            }
        });
        return conf;
    },

    parseStructKV(s) {
        if (!s) return [];
        const c = s.split(';')[0].trim().replace(/^\((.*)\)$/, '$1');
        return c.split(',').map(p => { const parts = p.split('='); return parts.length < 2 ? null : { k: parts[0].trim(), v: parts[1].trim() }; }).filter(x => x);
    },

    parseStructToObj(str) {
        const obj = {};
        this.parseStructKV(str).forEach(p => obj[p.k] = p.v);
        return obj;
    },

    generate(config) {
        let res = "";
        for (const [sec, keys] of Object.entries(config)) {
            res += `[${sec}]\n`;
            for (const [k, v] of Object.entries(keys)) {
                if (v && typeof v === 'object' && !Array.isArray(v)) {
                    Object.keys(v).sort((a, b) => a - b).forEach(i => res += `${k}[${i}]=${v[i]}\n`);
                } else if (Array.isArray(v)) {
                    v.forEach(v_val => res += `${k}=${v_val}\n`);
                } else {
                    res += `${k}=${v}\n`;
                }
            }
            res += "\n";
        }
        return res;
    }
};

export const SimEngine = {
    perkMap: { 1: "Ready For Anything", 2: "Flush", 3: "Rapid Fire", 4: "Sentinel", 5: "Tactical Sense", 6: "Aggression", 7: "Lightning Reflexes", 8: "Suppression", 10: "In The Zone", 14: "Dampening Field", 15: "Hardened", 16: "Squadsight", 17: "Low Profile", 25: "Close Encounters", 26: "Sprinter", 32: "Reinforced Armor", 44: "Vital Point Targeting", 64: "Regeneration", 70: "Damage Control", 71: "Shock-Absorbent Armor", 77: "Executioner", 80: "Opportunist", 91: "Covering Fire" },

    run(config, base_stats, upgrades, simConfig) {
        const rnd = (max) => Math.floor(Math.random() * max);
        const rollInterval = (min, max) => min >= max ? min : min + rnd(max - min + 1);
        const section = 'XComStrategyAIMutator.XGStrategyAI_Mod';

        const getVal = (k, def) => {
            const v = config[section]?.[k];
            if (!v) return def;
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                const keys = Object.keys(v).map(Number).sort((a, b) => a - b);
                return keys.map(i => v[i] || v[String(i)] || "");
            }
            return Array.isArray(v) ? v : [v];
        };

        const getBool = (k, def) => {
            const v = getVal(k, [String(def)])[0];
            return v === "true" || v === "True";
        };

        const research = simConfig.month * 28;
        const month = simConfig.month;
        const resources = simConfig.resources;

        const leaderLevelProgMult = parseFloat(getVal('LeaderLevelProgressionMultiplier', ["0.025"])[0]);
        const aliensPerPodMult = parseFloat(getVal('AdditionalAliensPerPodMultiplier', ["0.0075"])[0]);
        const diffProbDiv = parseFloat(getVal('DiffProbabilityDivisor', ["2.0"])[0]);
        const enableLeaders = getBool('EnableAlienLeaders', true);
        const enableResources = getBool('EnableAlienResources', true);
        const alwaysSpawnMain = getBool('AlwaysSpawnAtLeastOneMainAlien', true);
        const diffDecreaseProb = getBool('DiffDecreaseProbability', false);
        const podDiffMult = parseFloat(getVal('PodsDifficultyMultiplier', ["1.0"])[0]);

        // Leader Level Roll Logic from .uc
        const rollLeaderLevel = (forced = -1) => {
            if (!enableLeaders) return 0;
            if (forced > -1 && forced !== -1) return forced;
            const range = Math.min(Math.max(Math.floor(research * leaderLevelProgMult + 1), 1), 15);
            let rNum = rnd(range);
            if (rNum > 7) rNum = 7 - rnd(16 - range);
            return Math.min(Math.max(rNum, 0), 7);
        };

        const calculateStats = (type, researchVal, leaderLevel, isLeader) => {
            const base = base_stats[type] || { HP: "4", Offense: "65", Will: "30" };
            let hp = parseInt(base.HP || 4);
            let aim = parseInt(base.Offense || 65);
            let damage = 0;
            let will = parseInt(base.Will || 30);
            const perks = [];

            upgrades.forEach(up => {
                if (up.eType === type) {
                    const crit = parseInt(up.iCritHit || 0);
                    // Research Bonus (crit >= 15)
                    if (crit >= 15) {
                        if (researchVal >= Math.floor(crit / 100)) {
                            hp += parseInt(up.iHP || 0);
                            aim += parseInt(up.iAim || 0);
                            damage += parseInt(up.iDamage || 0);
                            will += parseInt(up.iWill || 0);
                            const perkId = parseInt(up.iMobility || 0);
                            if (perkId > 0 && !perks.includes(this.perkMap[perkId] || `Perk ${perkId}`)) {
                                perks.push(this.perkMap[perkId] || `Perk ${perkId}`);
                            }
                        }
                    }
                    // Leader Bonus (crit < 15)
                    else if (isLeader && leaderLevel >= crit) {
                        hp += parseInt(up.iHP || 0);
                        aim += parseInt(up.iAim || 0);
                        damage += parseInt(up.iDamage || 0);
                        will += parseInt(up.iWill || 0);
                        const perkId = parseInt(up.iMobility || 0);
                        if (perkId > 0 && !perks.includes(this.perkMap[perkId] || `Perk ${perkId}`)) {
                            perks.push(this.perkMap[perkId] || `Perk ${perkId}`);
                        }
                    }
                }
            });

            // Random variation (Rolling)
            const hpRoll = rnd(3) - 1; // -1, 0, +1
            const aimRoll = rnd(5) - 2; // -2 to +2

            return {
                hp: hp + hpRoll,
                aim: aim + aimRoll,
                damage,
                will,
                perks
            };
        };

        // 1. Pod Numbers
        const missionMap = {
            Abduction: { base: "AbductionPodNumbers", mod: "AbductionPodNumbersMonthlyModifiers", type: "AbductionPodTypes", typeMod: "AbductionPodTypesMonthlyModifiers" },
            Terror: { base: "TerrorPodNumbers", mod: "TerrorPodNumbersMonthlyModifiers", type: "TerrorPodTypes", typeMod: "TerrorPodTypesMonthlyModifiers" },
            UFO: { base: "UFOPodNumbers", mod: "UFOPodNumbersMonthlyModifiers", type: "UFOPodTypes", typeMod: "UFOPodTypesMonthlyModifiers" },
            BigUFO: { base: "UFOPodNumbers", mod: "UFOPodNumbersMonthlyModifiers", type: "BigUFOPodTypes", typeMod: "BigUFOPodTypesMonthlyModifiers" },
            Special: { base: "SpecialPodNumbers", mod: "SpecialPodNumbersMonthlyModifiers", type: "SpecialPodTypes", typeMod: "SpecialPodTypesMonthlyModifiers" },
            Extraction: { base: "ExtractionPodNumbers", mod: "ExtractionPodNumbersMonthlyModifiers", type: "ExtractionPodTypes", typeMod: "ExtractionPodTypesMonthlyModifiers" },
            CaptureAndHold: { base: "CaptureAndHoldPodNumbers", mod: "CaptureAndHoldPodNumbersMonthlyModifiers", type: "CaptureAndHoldPodTypes", typeMod: "CaptureAndHoldPodTypesMonthlyModifiers" },
            ExaltRaid: { base: "ExaltRaidPodNumbers", mod: null, type: "ExaltRaidPodTypes", typeMod: null },
            AlienBase: { base: "AlienBasePodNumbers", mod: null, type: "AlienBasePodTypes", typeMod: null }
        };

        const mInfo = missionMap[simConfig.mission] || missionMap.Abduction;
        const baseStr = getVal(mInfo.base, ["(MinPods=1,MaxPods=4)"])[0];
        const base = IniParser.parseStructToObj(baseStr);
        let minP = parseInt(base.MinPods || 1), maxP = parseInt(base.MaxPods || 4);

        if (mInfo.mod) {
            getVal(mInfo.mod, []).forEach(ms => {
                const m = IniParser.parseStructToObj(ms);
                if (parseInt(m.Month) <= month) {
                    if (m.MinPods !== undefined && m.MinPods !== "-1") minP = parseInt(m.MinPods);
                    if (m.MaxPods !== undefined && m.MaxPods !== "-1") maxP = parseInt(m.MaxPods);
                }
            });
        }

        let podModifier = 0;
        let effectiveDifficulty = simConfig.difficulty || 1;

        if (simConfig.mission === 'Abduction') {
            podModifier = Math.floor((effectiveDifficulty - 2) * podDiffMult);
        } else if (simConfig.mission === 'UFO' || simConfig.mission === 'BigUFO') {
            const shipSize = simConfig.shipSize || 0;
            const shipSizeMult = parseFloat(getVal('ShipSizeMultiplier', ["1.0"])[0]);
            podModifier = Math.floor(shipSize * shipSizeMult);
            effectiveDifficulty = shipSize;
        }

        const numPods = rollInterval(minP, maxP) + podModifier;

        // 2. Pod Categories
        const chances = {};
        getVal(mInfo.type, []).forEach(ts => { const t = IniParser.parseStructToObj(ts); chances[t.ID] = parseInt(t.TypeChance || 0); });
        if (mInfo.typeMod) {
            getVal(mInfo.typeMod, []).forEach(ms => { const m = IniParser.parseStructToObj(ms); if (parseInt(m.Month) <= month && m.TypeChance !== "-1") chances[m.ID] = parseInt(m.TypeChance); });
        }

        const ids = Object.keys(chances), weights = Object.values(chances);
        const podCategories = [];
        const totalWeight = weights.reduce((a, b) => a + b, 0);

        if (totalWeight > 0) {
            for (let i = 0; i < numPods; i++) {
                let roll = rnd(totalWeight), sum = 0;
                for (let j = 0; j < ids.length; j++) { if (roll < (sum += weights[j])) { podCategories.push(ids[j]); break; } }
            }
        } else {
            for (let i = 0; i < numPods; i++) podCategories.push('EPodTypeMod_Soldier');
        }

        if ((simConfig.mission === 'UFO' || simConfig.mission === 'BigUFO') && podCategories.length > 0) {
            podCategories.pop();
            podCategories.push('EPodTypeMod_Commander');
        }

        const results = { pods: [] };
        const catMap = {
            EPodTypeMod_Soldier: ["PossibleSoldiers", "SoldiersMonthlyModifiers"],
            EPodTypeMod_Terrorist: ["PossibleTerrorists", "TerroristsMonthlyModifiers"],
            EPodTypeMod_Commander: ["PossibleCommanders", "CommandersMonthlyModifiers"],
            EPodTypeMod_Elite: ["PossibleElites", "ElitesMonthlyModifiers"],
            EPodTypeMod_Special: ["PossibleSpecial", "SpecialMonthlyModifiers"],
            EPodTypeMod_Exalt: ["PossibleExalt", "ExaltMonthlyModifiers"],
            EPodTypeMod_ExaltElite: ["PossibleExaltElite", "ExaltEliteMonthlyModifiers"]
        };

        const counters = {};

        podCategories.forEach((cat, pIdx) => {
            const [baseK, modK] = catMap[cat] || ["PossibleSoldiers", "SoldiersMonthlyModifiers"];
            const poolStrings = getVal(baseK, []);
            const pool = poolStrings.map((s, i) => {
                const o = IniParser.parseStructToObj(s);
                o._id = i;
                return o;
            });

            getVal(modK, []).forEach(ms => {
                const mod = IniParser.parseStructToObj(ms);
                if (parseInt(mod.Month) <= month) {
                    const target = pool[parseInt(mod.ID)];
                    if (target) {
                        for (const [fk, fv] of Object.entries(mod)) {
                            if (['ID', 'Month'].includes(fk)) continue;
                            if (fv !== "-1" && fv !== "-2") target[fk] = fv;
                        }
                    }
                }
            });

            const weightedPool = pool.filter(s => {
                const cid = `${cat}_${s._id}`;
                const count = counters[cid] || 0;
                const limit = parseInt(s.PodLimit || -1);
                if (limit > -1 && count >= limit) return false;

                const podDiff = parseInt(s.PodDifficulty || 0);
                if (podDiff > effectiveDifficulty) {
                    if (diffDecreaseProb && diffProbDiv > 0) {
                        s.PodChance = Math.floor(parseInt(s.PodChance) / (diffProbDiv * (podDiff - effectiveDifficulty)));
                    } else {
                        return false;
                    }
                }
                return parseInt(s.PodChance || 0) > 0;
            });

            if (weightedPool.length === 0) return;

            const totalGWeight = weightedPool.reduce((a, b) => a + parseInt(b.PodChance), 0);
            const groupRoll = rnd(totalGWeight);
            let gSum = 0, group = null;
            for (const s of weightedPool) { if (groupRoll < (gSum += parseInt(s.PodChance))) { group = s; break; } }

            const cid = `${cat}_${group._id}`;
            counters[cid] = (counters[cid] || 0) + 1;

            const baseCount = rollInterval(parseInt(group.MinAliens || 1), parseInt(group.MaxAliens || 3));
            let totalCount = baseCount;
            if (enableResources) {
                totalCount += Math.floor(resources * aliensPerPodMult);
            }
            totalCount = Math.min(8, Math.max(1, totalCount));

            const podAliens = [];
            const l_level = rollLeaderLevel(parseInt(group.LeaderLevel || -1));

            // Determine composition proportions
            let mainN = 0, s1N = 0, s2N = 0;
            for (let i = 0; i < totalCount; i++) {
                const mc = (mainN > 0) ? 0 : parseInt(group.MainChance || 100);
                const s1c = parseInt(group.Support1Chance || 100);
                const s2c = parseInt(group.Support2Chance || 100);
                const roll = rnd(mc + s1c + s2c);
                if (roll < mc) mainN++; else if (roll < mc + s1c) s1N++; else s2N++;
            }
            if (alwaysSpawnMain && mainN === 0) { mainN = 1; if (s1N > s2N) s1N--; else s2N--; }

            // Generate individual alien records for "Rolling" feel
            const addAliens = (type, count, isLeaderCandidate) => {
                if (!type || type === 'eChar_None' || count <= 0) return;
                for (let i = 0; i < count; i++) {
                    const isLeader = isLeaderCandidate && i === 0;
                    const s = calculateStats(type, research, l_level, isLeader);
                    podAliens.push({
                        name: (isLeader ? "[Leader] " : "") + type.replace('eChar_', ''),
                        isLeader,
                        ...s
                    });
                }
            };

            addAliens(group.MainAlien, mainN, true);
            addAliens(group.SupportAlien1, s1N, false);
            addAliens(group.SupportAlien2, s2N, false);

            results.pods.push({
                index: pIdx + 1,
                category: cat.replace('EPodTypeMod_', ''),
                aliens: podAliens,
                leader_level: l_level,
                is_leader_pod: cat === 'EPodTypeMod_Commander'
            });
        });

        return results;
    }
};

if (typeof window !== 'undefined') {
    window.IniParser = IniParser;
    window.SimEngine = SimEngine;
}
