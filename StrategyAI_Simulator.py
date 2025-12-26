import re
import random
import configparser

class StrategyAISimulator:
    def __init__(self, strategy_ini_path, game_core_ini_path, config_override=None):
        self.strategy_ini_path = strategy_ini_path
        self.game_core_ini_path = game_core_ini_path
        self.config = {}
        self.base_stats = {} # Character Type -> Stats
        self.upgrades = [] # List of BalanceMods
        self.perk_map = {
            3: "Squadsight", 5: "Low Profile", 11: "Executioner", 23: "Rapid Reaction", 
            24: "Grenadier", 31: "Sprinter", 32: "Aggression", 33: "Tactical Sense", 
            45: "Regeneration", 50: "Muscle Fiber Density", 94: "Gunslinger", 138: "Combined Arms"
        }
        
        if config_override:
            self.config = config_override
        else:
            self.parse_ini()
            
        self.load_game_core_configs()

    def parse_ini(self):
        # Manual parsing for StrategyAIMod.ini
        if not self.strategy_ini_path: return
        # Manual parsing for StrategyAIMod.ini
        with open(self.strategy_ini_path, 'r') as f:
            current_section = None
            for line in f:
                line = line.split(';', 1)[0].strip()
                if not line: continue
                section_match = re.match(r'\[(.*)\]', line)
                if section_match:
                    current_section = section_match.group(1)
                    if current_section not in self.config: self.config[current_section] = {}
                    continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    key, val = key.strip(), val.strip()
                    array_match = re.match(r'(.*)\[(\d+)\]', key)
                    if array_match:
                        base_key, index = array_match.group(1), int(array_match.group(2))
                        if base_key not in self.config[current_section]: self.config[current_section][base_key] = {}
                        self.config[current_section][base_key][index] = val
                    else:
                        if key not in self.config[current_section]: self.config[current_section][key] = []
                        self.config[current_section][key].append(val)

    def load_game_core_configs(self):
        with open(self.game_core_ini_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                # Handle Characters
                if line.strip().startswith('Characters='):
                    struct = self.parse_struct(line.split('=', 1)[1])
                    if 'iType' in struct:
                        self.base_stats[struct['iType']] = struct
                # Handle BalanceMods
                if 'BalanceMods_Hard=' in line:
                    content = line.split('BalanceMods_Hard=', 1)[1]
                    struct = self.parse_struct(content)
                    # Try to extract perk name from comment
                    comment = line.split(';', 1)[1].strip() if ';' in line else ""
                    if comment and 'iMobility' in struct:
                        perk_id = int(struct['iMobility'])
                        if perk_id > 0 and perk_id not in self.perk_map:
                            # Clean up comment to get perk name
                            name = comment.split('?')[0].split('.')[0].strip()
                            if name: self.perk_map[perk_id] = name
                    self.upgrades.append(struct)

    def get_val(self, key, default=None):
        section = "XComStrategyAIMutator.XGStrategyAI_Mod"
        if section in self.config and key in self.config[section]:
            val = self.config[section][key]
            # Convert dict back to list if it was an array key
            if isinstance(val, dict):
                # JSON/IniManager stores keys as strings, but they are indices
                try:
                    max_idx = max([int(k) for k in val.keys()])
                    return [val.get(str(i), val.get(i, "")) for i in range(max_idx + 1)]
                except ValueError: 
                    # If empty dict or non-integer keys
                    return list(val.values())
            return val
        return default

    def parse_struct(self, struct_str):
        # Parses strings like (MinPods=3,MaxPods=4) or (ID=0,Month=0,...)
        # Strip potential trailing comment that escaped the line split
        struct_str = struct_str.split(';', 1)[0].strip()
        struct_str = struct_str.strip('()')
        
        # Split by comma, but be careful with nested structs if any (unlikely here)
        items = struct_str.split(',')
        result = {}
        for item in items:
            if '=' in item:
                k, v = item.split('=', 1)
                result[k.strip()] = v.strip()
        return result

    def get_strategic_month(self, research):
        enable_research = self.get_val("EnableAlienResearch", ["true"])[0].lower() == "true"
        if enable_research:
            return research // 28
        return 0 # Defaulting to start of campaign for simplicity in sim

    def roll_interval(self, min_val, max_val):
        if min_val >= max_val:
            return min_val
        # UC logic: Min + Rand(Max - Min). Rand(X) is X possible values 0 to X-1.
        # So Min + (0 to Max-Min-1) = Min to Max-1.
        return random.randrange(min_val, max_val)

    def get_pod_numbers(self, mission_type, research):
        month = self.get_strategic_month(research)
        
        # Base values
        base_map = {
            "Abduction": "AbductionPodNumbers",
            "Terror": "TerrorPodNumbers",
            "UFO": "UFOPodNumbers",
            "BigUFO": "UFOPodNumbers",
            "Special": "SpecialPodNumbers"
        }
        mod_map = {
            "Abduction": "AbductionPodNumbersMonthlyModifiers",
            "Terror": "TerrorPodNumbersMonthlyModifiers",
            "UFO": "UFOPodNumbersMonthlyModifiers",
            "BigUFO": "UFOPodNumbersMonthlyModifiers",
            "Special": "SpecialPodNumbersMonthlyModifiers"
        }
        
        base_str = self.get_val(base_map[mission_type], ["(MinPods=1,MaxPods=4)"])[0]
        base = self.parse_struct(base_str)
        min_p = int(base.get("MinPods", 1))
        max_p = int(base.get("MaxPods", 4))
        
        # Monthly modifiers
        mods = self.get_val(mod_map[mission_type], [])
        for mod_str in mods:
            m = self.parse_struct(mod_str)
            if int(m.get("Month", 999)) <= month:
                if "MinPods" in m: min_p = int(m["MinPods"])
                if "MaxPods" in m: max_p = int(m["MaxPods"])
            else:
                break
                
        return min_p, max_p

    def roll_pod_types(self, mission_type, num_pods, research):
        month = self.get_strategic_month(research)
        type_map = {
            "Abduction": "AbductionPodTypes",
            "Terror": "TerrorPodTypes",
            "UFO": "UFOPodTypes",
            "BigUFO": "BigUFOPodTypes",
            "Special": "SpecialPodTypes"
        }
        mod_map = {
            "Abduction": "AbductionPodTypesMonthlyModifiers",
            "Terror": "TerrorPodTypesMonthlyModifiers",
            "UFO": "UFOPodTypesMonthlyModifiers",
            "BigUFO": "BigUFOPodTypesMonthlyModifiers",
            "Special": "SpecialPodTypesMonthlyModifiers"
        }
        
        # Base types
        base_types = self.get_val(type_map[mission_type], [])
        chances = {}
        for t_str in base_types:
            t = self.parse_struct(t_str)
            chances[t["ID"]] = int(t["TypeChance"])
            
        # Monthly mods
        mods = self.get_val(mod_map[mission_type], [])
        for mod_str in mods:
            m = self.parse_struct(mod_str)
            if int(m.get("Month", 999)) <= month:
                chances[m["ID"]] = int(m["TypeChance"])
            else:
                break
                
        # Weighted roll
        pods = []
        ids = list(chances.keys())
        weights = list(chances.values())
        if sum(weights) == 0:
            return ["EPodTypeMod_Soldier"] * num_pods
            
        for _ in range(num_pods):
            pods.append(random.choices(ids, weights=weights)[0])
        return pods

    def get_species_list(self, pod_category, research):
        month = self.get_strategic_month(research)
        category_map = {
            "EPodTypeMod_Soldier": ("PossibleSoldiers", "SoldiersMonthlyModifiers"),
            "EPodTypeMod_Terror": ("PossibleTerrorists", "TerroristsMonthlyModifiers"),
            "EPodTypeMod_Commander": ("PossibleCommanders", "CommandersMonthlyModifiers"),
            "EPodTypeMod_Elite": ("PossibleElites", "ElitesMonthlyModifiers"),
            "EPodTypeMod_Special": ("PossibleSpecial", "SpecialMonthlyModifiers"),
            "EPodTypeMod_Exalt": ("PossibleExalt", "ExaltMonthlyModifiers"),
            "EPodTypeMod_ExaltElite": ("PossibleExaltElite", "ExaltEliteMonthlyModifiers")
        }
        
        base_key, mod_key = category_map.get(pod_category, ("PossibleSoldiers", "SoldiersMonthlyModifiers"))
        base_list = [self.parse_struct(s) for s in self.get_val(base_key, [])]
        mods = [self.parse_struct(m) for m in self.get_val(mod_key, [])]
        
        # Apply overrides
        for m in mods:
            if int(m["Month"]) <= month:
                idx = int(m["ID"])
                for key, val in m.items():
                    if key not in ["ID", "Month"] and val != "-1" and val != "-2":
                        base_list[idx][key] = val
            else:
                break
        
        return base_list

    def roll_leader_level(self, research, forced_level=-1):
        enable_leaders = self.get_val("EnableAlienLeaders", ["true"])[0].lower() == "true"
        if not enable_leaders:
            return 0
        if forced_level != -1:
            return forced_level
            
        prog_mult = float(self.get_val("LeaderLevelProgressionMultiplier", ["0.025"])[0])
        limit = int(research * prog_mult + 1)
        limit = max(1, min(limit, 15))
        
        rand_num = random.randint(0, limit - 1)
        if rand_num > 7:
            # Logic from UC: 7 - Rand(16 - Range)
            rand_num = 7 - random.randint(0, 16 - limit - 1)
            
        return max(0, min(rand_num, 7))

    def roll_individual_aliens(self, group, count, exclude_main=False):
        # Mimics UC logic for distributing aliens into Main/Support1/Support2 slots
        main_count = 0
        s1_count = 0
        s2_count = 0
        
        main_chance = int(group.get("MainChance", 100))
        s1_chance = int(group.get("Support1Chance", 100))
        s2_chance = int(group.get("Support2Chance", 100))

        for i in range(count):
            # UC: RollIndividualSpecies(Species, AlienNumbers[0] > 1)
            # This means if main_count > 1, exclude main
            current_exclude_main = (main_count > 1) or exclude_main
            
            mc = 0 if current_exclude_main else main_chance
            s1c = s1_chance
            s2c = s2_chance
            
            # If everything is 0, fallback to support
            if mc == 0 and s1c == 0 and s2c == 0:
                s1c, s2c = 100, 100

            sum_c = mc + s1c + s2c
            rand_num = random.randrange(0, sum_c)
            
            if rand_num < mc: main_count += 1
            elif rand_num < mc + s1c: s1_count += 1
            else: s2_count += 1

        # Check AlwaysSpawnAtLeastOneMainAlien logic (UC lines 877-888)
        always_main = self.get_val("AlwaysSpawnAtLeastOneMainAlien", ["true"])[0].lower() == "true"
        if always_main and main_count == 0 and count > 0:
            main_count = 1
            if s1_count > s2_count: s1_count -= 1
            else: s2_count -= 1
            
        return main_count, s1_count, s2_count

    def get_mission_data(self, mission_type, research=0, resources=0, difficulty=1, landed=True, ship_type="eShip_UFOSupply"):
        month = self.get_strategic_month(research)
        num_aliens_modifier = 0
        
        # UFO specific logic
        if mission_type == "UFO":
            ship_size_map = {
                "eShip_UFOSmallScout": 0, "eShip_UFOLargeScout": 1, "eShip_UFOAbductor": 2, "eShip_UFOSupply": 3, "eShip_UFOBattle": 4
            }
            ship_size = ship_size_map.get(ship_type, 0)
            mission_difficulty = ship_size 
            
            smallest_big = self.get_val("SmallestBigUFO", ["eShip_UFOSupply"])[0]
            ufo_mission_category = "BigUFO" if ship_size >= ship_size_map.get(smallest_big, 3) else "UFO"
                
            ship_size_mult = float(self.get_val("ShipSizeMultiplier", ["1.5"])[0])
            modifier = int(ship_size * ship_size_mult)
            min_p, max_p = self.get_pod_numbers(ufo_mission_category, research)
            
            num_pods_roll = self.roll_interval(min_p, max_p) + modifier
            
            if not landed:
                crashed_pods_pct = int(self.get_val("CrashedUFOSurviedPodsPercentage", ["70"])[0])
                crashed_aliens_pct = int(self.get_val("CrashedUFOSurvedAliensPercentage", ["60"])[0])
                # UC: NumPods = RollInterval(MinNumPods, MaxNumPods)
                max_np = num_pods_roll
                min_np = int(num_pods_roll * crashed_pods_pct / 100)
                num_pods_roll = self.roll_interval(min_np, max_np)
                num_aliens_modifier = -(100 - crashed_aliens_pct)
                
            pod_categories = self.roll_pod_types(ufo_mission_category, num_pods_roll, research)
            # Remove a pod if we need space for commander (UC logic: command pod added after RollPodTypes)
            if len(pod_categories) > 0:
                pod_categories.pop()
            pod_categories.append("EPodTypeMod_Commander")
            
        else:
            min_p, max_p = self.get_pod_numbers(mission_type, research)
            modifier = 0
            if mission_type == "Abduction":
                pods_diff_mult = float(self.get_val("PodsDifficultyMultiplier", ["0.5"])[0])
                modifier = int((difficulty - 1) * pods_diff_mult)
                
            num_pods_roll = self.roll_interval(min_p, max_p) + modifier
            pod_categories = self.roll_pod_types(mission_type, num_pods_roll, research)
            mission_difficulty = difficulty

        num_pods = len(pod_categories)
        aliens_per_pod_mult = float(self.get_val("AdditionalAliensPerPodMultiplier", ["0.0075"])[0])
        resource_bonus = int(resources * aliens_per_pod_mult)
        
        # Difficulty Gating Config
        diff_decrease = self.get_val("DiffDecreaseProbability", ["true"])[0].lower() == "true"
        diff_divisor = int(self.get_val("DiffProbabilityDivisor", ["1"])[0])

        pods_data = []
        pod_limit_counters = {} # Category -> SpeciesIndex -> Count
        
        for i, cat in enumerate(pod_categories):
            species_pool = self.get_species_list(cat, research)
            
            # Step 1: Adjust chances for Difficulty Gating (UC lines 1100-1110)
            final_pool = []
            for idx, s in enumerate(species_pool):
                s_copy = s.copy()
                s_copy['_idx'] = idx # Store original index for limit tracking
                chance = int(s_copy.get("PodChance", 0))
                diff = int(s_copy.get("PodDifficulty", 0))
                limit = int(s_copy.get("PodLimit", -1))
                
                # Check Limit (UC 1095)
                current_count = pod_limit_counters.get(cat, {}).get(idx, 0)
                if limit > -1 and current_count >= limit:
                    chance = 0
                
                # Check Difficulty (UC 1100)
                elif diff > mission_difficulty:
                    if diff_decrease and diff_divisor > 0:
                        chance = chance // (diff_divisor * (diff - mission_difficulty))
                    else:
                        chance = 0
                
                if chance > 0:
                    s_copy['PodChance'] = chance
                    final_pool.append(s_copy)

            if not final_pool:
                # Fallback to anything with a chance (ignores difficulty if everything is too hard)
                final_pool = [s for s in species_pool if int(s.get("PodChance", 0)) > 0]
                
            if not final_pool: continue
                
            weights = [int(s["PodChance"]) for s in final_pool]
            group = random.choices(final_pool, weights=weights)[0]
            
            # Track Limit
            if cat not in pod_limit_counters: pod_limit_counters[cat] = {}
            pod_limit_counters[cat][group['_idx']] = pod_limit_counters[cat].get(group['_idx'], 0) + 1
            
            # Roll Headcount (UC 845-861)
            base_count = self.roll_interval(int(group.get("MinAliens", 1)), int(group.get("MaxAliens", 3)))
            count = base_count + resource_bonus
            
            if num_aliens_modifier != 0:
                if num_aliens_modifier < 0:
                    min_a = int(count * (1 + num_aliens_modifier/100))
                    max_a = count
                    count = self.roll_interval(min_a, max_a)
                else:
                    min_a = count
                    max_a = int(count * (1 + num_aliens_modifier/100))
                    count = self.roll_interval(min_a, max_a)
            
            count = max(1, min(count, 8))
            
            m_count, s1_count, s2_count = self.roll_individual_aliens(group, count)
            leader_lv = self.roll_leader_level(research, forced_level=int(group.get("LeaderLevel", -1)))
            
            aliens_list = []
            # ... alien formatting ...
            char_types = [group['MainAlien'], group.get('SupportAlien1', 'eChar_None'), group.get('SupportAlien2', 'eChar_None')]
            char_counts = [m_count, s1_count, s2_count]
            
            for char_type, char_count in zip(char_types, char_counts):
                if char_count <= 0 or char_type == "eChar_None": continue
                base = self.base_stats.get(char_type, {"HP": "1", "Offense": "50", "Will": "10"})
                hp, aim, will, damage, perks = int(base.get("HP", 1)), int(base.get("Offense", 50)), int(base.get("Will", 10)), 0, []
                is_unit_leader = (char_type == group['MainAlien'] and leader_lv > 0)
                
                for up in self.upgrades:
                    if up.get("eType") != char_type: continue
                    crit_hit = int(up.get("iCritHit", 0))
                    l_lv, r_req = crit_hit % 100, crit_hit // 100
                    
                    if (l_lv >= 15 and research >= r_req) or (is_unit_leader and l_lv == leader_lv):
                        hp += int(up.get("iHP", 0)); aim += int(up.get("iAim", 0)); will += int(up.get("iWill", 0)); damage += int(up.get("iDamage", 0))
                        p_id = int(up.get("iMobility", 0))
                        if p_id > 0: perks.append(self.perk_map.get(p_id, f"Perk {p_id}"))

                aliens_list.append({"name": char_type.replace("eChar_", ""), "count": char_count, "is_main": char_type == group['MainAlien'],
                                  "hp": hp, "aim": aim, "will": will, "damage_bonus": damage, "perks": perks})

            pods_data.append({"index": i + 1, "category": cat.replace("EPodTypeMod_", ""), "is_leader_pod": cat == "EPodTypeMod_Commander",
                            "aliens": aliens_list, "total_count": count, "leader_level": leader_lv})

        return {"mission_type": mission_type, "month": month, "research": research, "resources": resources, "num_pods": num_pods, "pods": pods_data}

    def simulate_mission(self, mission_type, research=0, resources=0, difficulty=1, landed=True, ship_type="eShip_UFOSupply"):
        data = self.get_mission_data(mission_type, research, resources, difficulty, landed, ship_type)
        print(f"=== SIMULATION: {data['mission_type']} ===")
        print(f"Strategic Month: {data['month']} (Research: {data['research']}, Resources: {data['resources']})")
        print(f"Expected Pods: {data['num_pods']}")
        
        for p in data['pods']:
            leader_str = "COMMANDER " if p['is_leader_pod'] else ""
            print(f"  Pod {p['index']}: [{leader_str}{p['category']}] (Leader Lvl {p['leader_level']})")
            for a in p['aliens']:
                perk_str = f" [Perks: {', '.join(a['perks'])}]" if a['perks'] else ""
                main_str = "*" if a['is_main'] else " "
                print(f"    {main_str} {a['name']} x{a['count']} | HP: {a['hp']}, Aim: {a['aim']}, Will: {a['will']}{perk_str}")

if __name__ == "__main__":
    sim = StrategyAISimulator("configs/DefaultStrategyAIMod.ini", "configs/other/DefaultGameCore.ini")
    
    # 1. Swarming Terror mission in September
    # September is Month 6. Research approx 180, Resources approx 120
    print("SCENARIO 1: Swarming Terror Mission (September)")
    sim.simulate_mission("Terror", research=168, resources=120, difficulty=100) # Month 6 = 168/28
    
    print("\n" + "="*50 + "\n")
    
    # 2. Landed Large UFO in April
    # April is Month 1. Research approx 30, Resources approx 20
    print("SCENARIO 2: Landed Large UFO (April)")
    sim.simulate_mission("UFO", research=28, resources=20, landed=True, ship_type="eShip_UFOSupply")
