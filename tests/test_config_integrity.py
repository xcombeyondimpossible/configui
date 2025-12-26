
import unittest
import re
import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from IniConfigManager import IniConfigManager

class TestConfigIntegrity(unittest.TestCase):
    def setUp(self):
        self.config_path = os.path.join(os.path.dirname(__file__), '../configs/DefaultStrategyAIMod.ini')
        self.mgr = IniConfigManager(self.config_path)

    def test_struct_integrity(self):
        """
        Validates that all configuration values that look like structs (encased in parenthesis)
        contain valid key=value pairs separated by commas.
        """
        config = self.mgr.load_config()
        
        malformed_entries = []

        for section, keys in config.items():
            for key, val in keys.items():
                # Handle both list and dict (indexed) storage
                values_to_check = []
                if isinstance(val, dict):
                    values_to_check = val.values()
                elif isinstance(val, list):
                    values_to_check = val
                else:
                    values_to_check = [val]

                for item in values_to_check:
                    if isinstance(item, str) and item.startswith('(') and item.endswith(')'):
                        # Remove outer parens
                        content = item[1:-1]
                        # Split by comma
                        pairs = content.split(',')
                        for pair in pairs:
                            pair = pair.strip()
                            if not pair: 
                                continue # Empty pair likely due to trailing/leading comma, which might be OK or ignored
                            if '=' not in pair:
                                malformed_entries.append(f"Section [{section}] Key '{key}': Invalid struct item parts '{pair}' in '{item}'")

        if malformed_entries:
            self.fail("Found malformed struct entries:\n" + "\n".join(malformed_entries))

if __name__ == '__main__':
    unittest.main()
