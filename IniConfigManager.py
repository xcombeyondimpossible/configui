import os
import shutil
import re
from collections import OrderedDict

class IniConfigManager:
    def __init__(self, ini_path):
        self.ini_path = os.path.abspath(ini_path)
        self.original_path = self.ini_path + ".original"

    def ensure_original_exists(self):
        """Creates a permanent .original backup if one doesn't exist."""
        if not os.path.exists(self.original_path):
            if os.path.exists(self.ini_path):
                shutil.copy2(self.ini_path, self.original_path)
                print(f"Created permanent backup: {self.original_path}")
            else:
                print("Warning: Source INI file not found, cannot create backup.")

    def revert_to_original(self):
        """Restores the INI file from the .original backup."""
        if os.path.exists(self.original_path):
            shutil.copy2(self.original_path, self.ini_path)
            print(f"Reverted {self.ini_path} to original state.")
            return True
        return False

    def load_config(self):
        """Parses the INI file into a dictionary preserving structure."""
        config = OrderedDict()
        current_section = None
        
        if not os.path.exists(self.ini_path):
            return {}

        with open(self.ini_path, 'r', encoding='utf-8', errors='ignore') as f:
            for line in f:
                raw_line = line
                line = line.split(';', 1)[0].strip()
                
                if not line:
                    continue
                
                section_match = re.match(r'\[(.*)\]', line)
                if section_match:
                    current_section = section_match.group(1)
                    if current_section not in config:
                        config[current_section] = OrderedDict()
                    continue
                
                if '=' in line:
                    if current_section is None:
                        continue # Skip keys outside sections
                        
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip()
                    
                    # Handle array indexing: Key[Index] -> Key
                    array_match = re.match(r'(.*)\[(\d+)\]', key)
                    if array_match:
                        base_key = array_match.group(1)
                        index = int(array_match.group(2))
                        if base_key not in config[current_section]:
                            config[current_section][base_key] = {}
                        config[current_section][base_key][index] = val
                    else:
                        if key not in config[current_section]:
                            config[current_section][key] = []
                        config[current_section][key].append(val)
        
        return config

    def save_config(self, data):
        """Writes the configuration dictionary back to the INI file."""
        lines = []
        for section, keys in data.items():
            lines.append(f"[{section}]")
            for key, values in keys.items():
                if isinstance(values, dict):
                    # It's an indexed map (Key[i]=Val)
                    # Sort by index to keep it clean
                    sorted_indices = sorted([int(k) for k in values.keys()])
                    for idx in sorted_indices:
                        val = values[str(idx)] if str(idx) in values else values[idx]
                        lines.append(f"{key}[{idx}]={val}")
                elif isinstance(values, list):
                    # It's a standard list (Key=Val, Key=Val...)
                    for val in values:
                        lines.append(f"{key}={val}")
                else:
                    # Single value fallback
                    lines.append(f"{key}={values}")
            lines.append("") # Empty line between sections
        
        with open(self.ini_path, 'w', encoding='utf-8') as f:
            f.write("\n".join(lines))
