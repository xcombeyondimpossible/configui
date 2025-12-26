from flask import Flask, render_template, request, jsonify
from StrategyAI_Simulator import StrategyAISimulator
from IniConfigManager import IniConfigManager
import os
import json

app = Flask(__name__)
# Initialize Config Manager
ini_mgr = IniConfigManager("configs/DefaultStrategyAIMod.ini")
ini_mgr.ensure_original_exists()

# Initialize Simulator (Standard Mode)
sim = StrategyAISimulator("configs/DefaultStrategyAIMod.ini", "configs/other/DefaultGameCore.ini")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/editor')
def editor():
    return render_template('config_editor.html')

@app.route('/api/config', methods=['GET', 'POST'])
def api_config():
    if request.method == 'GET':
        return jsonify(ini_mgr.load_config())
    else:
        # Save Config
        new_data = request.json
        ini_mgr.save_config(new_data)
        # Re-init simulator to pick up changes on disk
        global sim
        sim = StrategyAISimulator("configs/DefaultStrategyAIMod.ini", "configs/other/DefaultGameCore.ini")
        return jsonify({"status": "saved"})

@app.route('/api/revert', methods=['POST'])
def api_revert():
    if ini_mgr.revert_to_original():
        # Re-init simulator
        global sim
        sim = StrategyAISimulator("configs/DefaultStrategyAIMod.ini", "configs/other/DefaultGameCore.ini")
        return jsonify({"status": "reverted", "config": ini_mgr.load_config()})
    return jsonify({"status": "error", "message": "No backup found"}), 404

@app.route('/api/simulate_draft', methods=['POST'])
def simulate_draft():
    # Runs a simulation using the config payload WITHOUT saving to disk
    req = request.json
    config_data = req.get('config')
    mission_params = req.get('params')
    
    # Init temp simulator with memory config
    temp_sim = StrategyAISimulator(None, "configs/other/DefaultGameCore.ini", config_override=config_data)
    
    # Run logic (duplicated from standard roll but using temp_sim)
    data = temp_sim.get_mission_data(
        mission_params.get('mission_type', 'Abduction'),
        research=int(mission_params.get('research', 0)),
        resources=int(mission_params.get('resources', 0)),
        difficulty=int(mission_params.get('difficulty', 1)),
        landed=mission_params.get('landed', True),
        ship_type=mission_params.get('ship_type', 'eShip_UFOSupply')
    )
    return jsonify(data)

@app.route('/roll', methods=['POST'])
def roll():
    data = request.json
    mission_type = data.get('mission_type', 'Abduction')
    research = int(data.get('research', 0))
    resources = int(data.get('resources', 0))
    difficulty = int(data.get('difficulty', 1))
    landed = data.get('landed', True)
    ship_type = data.get('ship_type', 'eShip_UFOSupply')
    
    result = sim.get_mission_data(mission_type, research, resources, difficulty, landed, ship_type)
    return jsonify(result)

@app.route('/api/constants', methods=['GET'])
def api_constants():
    # Return useful constants for dropdowns
    # eChars: extracted from sim.base_stats keys (which come from DefaultGameCore.ini)
    e_chars = sorted(list(sim.base_stats.keys()))
    
    # Static lists for other types if needed (e.g. ship types)
    e_ships = [
        "eShip_UFOSmallScout", "eShip_UFOLargeScout", "eShip_UFOAbductor", 
        "eShip_UFOSupply", "eShip_UFOBattle", "eShip_UFOEthereal", "eShip_UFOOverseer"
    ]
    
    return jsonify({
        "eChars": e_chars,
        "eShips": e_ships
    })

if __name__ == '__main__':
    app.run(debug=True, port=5001)
